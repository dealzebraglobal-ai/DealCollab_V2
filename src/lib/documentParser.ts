import mammoth from 'mammoth';
import type { PDFParse } from 'pdf-parse';

/**
 * 🛠️ ROBUST DOCUMENT PARSING SYSTEM (v3.0)
 * Per-page hybrid pipeline: native text extraction first, OCR only for the
 * specific pages that need it.
 *
 * History:
 * - v2.0 used pdf-parse for whole-document text, then pdf2pic (which shells
 *   out to system GraphicsMagick/Ghostscript binaries) + tesseract.js as an
 *   all-or-nothing OCR fallback, racing the whole attempt against one 240s
 *   timeout and returning placeholder text on failure. GraphicsMagick/
 *   Ghostscript are not installed in Vercel's Node runtime, so OCR always
 *   stalled to that timeout in production (~247s observed) and the
 *   placeholder text was mistaken for a successful extraction downstream.
 * - v2.1 (2026-08-28) bounded every step and made failures throw instead of
 *   returning placeholder text, but OCR itself remained non-functional on
 *   Vercel (still depended on pdf2pic/GraphicsMagick).
 * - v3.0 (2026-08-28) replaces pdf2pic entirely with pdf-parse's own
 *   getScreenshot() — it renders pages via @napi-rs/canvas, a prebuilt
 *   N-API binary (already a transitive dependency of pdf-parse, resolved
 *   per-platform by npm), not a system binary Vercel would need to install
 *   separately. This also enables genuine PAGE-LEVEL hybrid extraction:
 *   each page is independently classified as native-text-sufficient or
 *   OCR-needed (e.g. page 1 native, page 2 OCR, page 3 native, page 4 OCR),
 *   instead of OCR-ing the whole document as a unit.
 * - 2026-08-29: added STEP/FAILURE diagnostic markers (console.error, since
 *   next.config.ts strips console.log/warn in production) so the exact
 *   failing operation in a real production 500 can finally be identified —
 *   this is diagnostic-only, no parsing behavior changed.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Timeouts — every native/network sub-step is bounded so a single document
// can never hold a serverless invocation open for minutes.
const PDF_EXTRACTION_TIMEOUT_MS = envInt('PDF_EXTRACTION_TIMEOUT_MS', 20_000);
const OCR_WORKER_INIT_TIMEOUT_MS = envInt('OCR_WORKER_INIT_TIMEOUT_MS', 20_000);
const OCR_PAGE_TIMEOUT_MS = envInt('OCR_PAGE_TIMEOUT_MS', 20_000);

// Document-size limits — configurable via env so large-but-legitimate
// business documents can be tuned without a code change.
const DOCUMENT_MAX_PAGES = envInt('DOCUMENT_MAX_PAGES', 60);            // pages actually processed for text
const DOCUMENT_MAX_OCR_PAGES = envInt('DOCUMENT_MAX_OCR_PAGES', 5);     // OCR budget per document (bounds worst-case time)
const DOCUMENT_HARD_MAX_PAGES = envInt('DOCUMENT_HARD_MAX_PAGES', 500); // beyond this, refuse outright (DOCUMENT_TOO_LARGE)
const DOCUMENT_MAX_TEXT_LENGTH = envInt('DOCUMENT_MAX_TEXT_LENGTH', 200_000); // caps the final joined text handed to callers/DB/AI

// A normal text page in an M&A teaser/IM typically has hundreds of
// characters; below this, a page is treated as scanned/image-based and
// routed to OCR instead. Evaluated per page (not per document), which is
// what makes true page-level hybrid extraction possible.
const MIN_PAGE_TEXT_CHARS = 40;

export interface ExtractionResult {
  text: string;
  pageCount: number | null;
  extractionMethod: 'native' | 'ocr' | 'hybrid' | 'n/a';
  pagesProcessed: number;
  warnings: string[];
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

/**
 * Strips anything that could be a credential/signed-URL token before an
 * error message ever reaches the logs — some thrown errors interpolate the
 * failing URL or raw provider response verbatim (e.g. a fetch() failure
 * message can include the request URL).
 */
function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/([?&](?:token|signature|key|secret|auth|apikey)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/https?:\/\/\S+/gi, (url) => url.split('?')[0]);
}

/**
 * Single place every "this step failed" log goes through, so every failure
 * is reported in the same safe, greppable shape and never leaks a raw
 * error/stack that might contain a signed URL or credential fragment.
 * Deliberately logs name+message only — never `error.stack` (stack frames
 * can echo argument values, including buffers/URLs, depending on the
 * throwing library) and never document content.
 */
export function logParseFailure(
  requestId: string,
  step: string,
  error: unknown,
  extra?: Record<string, string | number>,
): void {
  const e = error instanceof Error ? error : new Error(String(error));
  const extraStr = extra ? ' ' + Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(' ') : '';
  console.error(
    `[parse-document][request=${requestId}] FAILURE step=${step}${extraStr} error_name=${e.name} error_message=${sanitizeErrorMessage(e.message)}`,
  );
}

/**
 * Clean and normalize extracted text
 */
function cleanText(text: string): string {
  if (!text) return "";

  return text
    .replace(/[^\x20-\x7E\n\r\t]/g, "") // Remove non-ASCII garbage
    .replace(/\s+/g, " ")               // Normalize whitespace
    .replace(/\n\s*\n/g, "\n\n")        // Keep meaningful line breaks
    .trim();
}

export async function extractDocxText(fileBuffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return cleanText(result.value);
  } catch (err) {
    console.error("[DOCX] Extraction failed:", err instanceof Error ? err.message : String(err));
    return "";
  }
}

/**
 * Per-page hybrid PDF extraction: native text extraction for every page,
 * OCR only for pages whose native text is insufficient (scanned/image
 * pages), up to DOCUMENT_MAX_OCR_PAGES. A single tesseract worker is
 * created lazily — only if at least one page actually needs OCR — and is
 * always terminated, even on failure.
 */
async function extractPdf(buffer: Buffer, requestId: string): Promise<ExtractionResult> {
  const tag = `[parse-document][request=${requestId}]`;

  console.error(`${tag} STEP parser-init:start`);
  let parser: PDFParse;
  try {
    const pdfParseModule = await import('pdf-parse');
    parser = new pdfParseModule.PDFParse({ data: buffer });
  } catch (initErr) {
    logParseFailure(requestId, 'parser-init', initErr);
    throw new Error(`IMAGE_BASED_PDF: PDF parser initialization failed (${initErr instanceof Error ? initErr.message : String(initErr)})`);
  }
  console.error(`${tag} STEP parser-init:success`);

  type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
  let worker: TesseractWorker | null = null;

  try {
    console.error(`${tag} STEP native-extraction:start`);
    const nativeStart = Date.now();
    let textResult: { total: number; pages: Array<{ num: number; text: string }> };
    try {
      textResult = await withTimeout(parser.getText(), PDF_EXTRACTION_TIMEOUT_MS, 'PDF text extraction');
    } catch (pdfErr) {
      logParseFailure(requestId, 'native-extraction', pdfErr);
      throw new Error(`IMAGE_BASED_PDF: Native PDF text extraction failed (${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)})`);
    }
    console.error(`${tag} native-text extraction: ${Date.now() - nativeStart}ms pages=${textResult.total}`);
    console.error(`${tag} STEP native-extraction:success`);

    const totalPages = textResult.total || textResult.pages.length || 0;
    if (totalPages > DOCUMENT_HARD_MAX_PAGES) {
      throw new Error(
        `DOCUMENT_TOO_LARGE: This document has ${totalPages} pages, which exceeds the ${DOCUMENT_HARD_MAX_PAGES}-page processing limit.`,
      );
    }

    const pagesToProcess = Math.max(1, Math.min(totalPages, DOCUMENT_MAX_PAGES));
    const warnings: string[] = [];
    if (totalPages > pagesToProcess) {
      warnings.push(`Document has ${totalPages} pages; only the first ${pagesToProcess} were processed.`);
    }

    const perPageText: string[] = [];
    let usedNative = false;
    let usedOcr = false;
    let ocrPagesUsed = 0;
    const ocrStart = Date.now();

    for (let i = 0; i < pagesToProcess; i++) {
      const pageNum = i + 1;
      const nativeText = (textResult.pages[i]?.text || '').trim();

      if (nativeText.length >= MIN_PAGE_TEXT_CHARS) {
        perPageText.push(nativeText);
        usedNative = true;
        continue;
      }

      if (ocrPagesUsed >= DOCUMENT_MAX_OCR_PAGES) {
        warnings.push(`Page ${pageNum} has little/no extractable text and the OCR page limit (${DOCUMENT_MAX_OCR_PAGES}) was already reached.`);
        continue;
      }

      try {
        if (!worker) {
          console.error(`${tag} STEP ocr:start`);
          const { createWorker } = await import('tesseract.js');
          worker = await withTimeout(createWorker('eng'), OCR_WORKER_INIT_TIMEOUT_MS, 'OCR worker initialization');
          console.error(`${tag} STEP ocr:success`);
        }

        console.error(`${tag} STEP screenshot:start page=${pageNum}`);
        const shot = await withTimeout(
          parser.getScreenshot({ partial: [pageNum], imageDataUrl: true, imageBuffer: false }),
          OCR_PAGE_TIMEOUT_MS,
          `OCR page ${pageNum} rendering`,
        );
        const dataUrl = shot.pages[0]?.dataUrl;
        if (!dataUrl) throw new Error('page render produced no image data');
        console.error(`${tag} STEP screenshot:success page=${pageNum}`);

        const { data: { text: ocrText } } = await withTimeout(
          worker.recognize(dataUrl),
          OCR_PAGE_TIMEOUT_MS,
          `OCR page ${pageNum} recognition`,
        );

        ocrPagesUsed++;
        if (ocrText.trim()) {
          perPageText.push(ocrText.trim());
          usedOcr = true;
        } else {
          warnings.push(`Page ${pageNum} produced no readable text (native extraction and OCR both came back empty).`);
        }
      } catch (pageErr) {
        ocrPagesUsed++;
        logParseFailure(requestId, 'ocr-or-screenshot', pageErr, { page: pageNum });
        warnings.push(`Page ${pageNum} could not be processed: ${pageErr instanceof Error ? pageErr.message : String(pageErr)}`);
      }
    }

    if (ocrPagesUsed > 0) {
      console.error(`${tag} OCR: ${Date.now() - ocrStart}ms pages=${ocrPagesUsed}`);
    }

    let text = perPageText.join('\n\n');
    if (text.length > DOCUMENT_MAX_TEXT_LENGTH) {
      text = text.slice(0, DOCUMENT_MAX_TEXT_LENGTH);
      warnings.push(`Extracted text was truncated to ${DOCUMENT_MAX_TEXT_LENGTH} characters.`);
    }

    if (!text.trim()) {
      throw new Error(
        'IMAGE_BASED_PDF: No readable text could be extracted from any page (native extraction and OCR both produced nothing usable).',
      );
    }

    return {
      text,
      pageCount: totalPages,
      extractionMethod: usedNative && usedOcr ? 'hybrid' : usedOcr ? 'ocr' : 'native',
      pagesProcessed: pagesToProcess,
      warnings,
    };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    await parser.destroy().catch(() => {});
  }
}

export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  requestId: string = crypto.randomUUID(),
): Promise<ExtractionResult> {
  const tag = `[parse-document][request=${requestId}]`;
  console.error(`${tag} Received ${mimeType} (${buffer.length} bytes)`);

  try {
    let result: ExtractionResult;

    // 1. DOCX Handling
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      const text = await extractDocxText(buffer);
      result = { text, pageCount: null, extractionMethod: 'native', pagesProcessed: 1, warnings: [] };
    }

    // 2. Plain Text Handling
    else if (mimeType === 'text/plain') {
      result = { text: buffer.toString('utf-8'), pageCount: null, extractionMethod: 'native', pagesProcessed: 1, warnings: [] };
    }

    // 3. PDF Handling — native-first, per-page OCR fallback
    else if (mimeType === 'application/pdf') {
      result = await extractPdf(buffer, requestId);
    }

    // 4. Unsupported Handling — the route layer's SUPPORTED_TYPES list
    // includes image MIME types that have no extraction path here; treat
    // that as a genuine failure rather than a placeholder string that
    // would otherwise sail through as "successfully extracted" text.
    else {
      console.warn(`[PARSER] Unsupported MIME type: ${mimeType}`);
      throw new Error(`UNSUPPORTED_FILE_TYPE: No text-extraction path is implemented for ${mimeType}.`);
    }

    // Final Clean
    const finalText = cleanText(result.text);

    // Never report a near-empty result as a successful extraction.
    if (!finalText || finalText.length < 5) {
      throw new Error("EXTRACTION_FAILED: Document content could not be fully extracted. It may be an empty file or protected.");
    }

    console.error(
      `${tag} Final extraction: ${finalText.length} chars, method=${result.extractionMethod}, pages=${result.pagesProcessed}/${result.pageCount ?? 'n/a'}, warnings=${result.warnings.length}`,
    );

    return { ...result, text: finalText };

  } catch (globalErr) {
    logParseFailure(requestId, 'extract-text-from-file', globalErr);
    // Preserve specific, classifiable error messages (IMAGE_BASED_PDF: /
    // EXTRACTION_FAILED: / UNSUPPORTED_FILE_TYPE: / DOCUMENT_TOO_LARGE: /
    // timed out) for the caller to map to the right HTTP status — never
    // swallow into a placeholder string that would be mistaken for real
    // document text.
    if (globalErr instanceof Error) throw globalErr;
    throw new Error("An error occurred while parsing the document. Please ensure the file is not password-protected.");
  }
}
