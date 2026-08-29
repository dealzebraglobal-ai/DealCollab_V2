import mammoth from 'mammoth';

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
    console.error("[DOCX] Extraction failed:", err);
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
async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const pdfParseModule = await import('pdf-parse');
  const parser = new pdfParseModule.PDFParse({ data: buffer });

  type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
  let worker: TesseractWorker | null = null;

  try {
    const nativeStart = Date.now();
    let textResult: { total: number; pages: Array<{ num: number; text: string }> };
    try {
      textResult = await withTimeout(parser.getText(), PDF_EXTRACTION_TIMEOUT_MS, 'PDF text extraction');
    } catch (pdfErr) {
      throw new Error(
        `IMAGE_BASED_PDF: Native PDF text extraction failed (${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)})`,
      );
    }
    console.log(`[parse-document] native-text extraction: ${Date.now() - nativeStart}ms pages=${textResult.total}`);

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
          const { createWorker } = await import('tesseract.js');
          worker = await withTimeout(createWorker('eng'), OCR_WORKER_INIT_TIMEOUT_MS, 'OCR worker initialization');
        }

        const shot = await withTimeout(
          parser.getScreenshot({ partial: [pageNum], imageDataUrl: true, imageBuffer: false }),
          OCR_PAGE_TIMEOUT_MS,
          `OCR page ${pageNum} rendering`,
        );
        const dataUrl = shot.pages[0]?.dataUrl;
        if (!dataUrl) throw new Error('page render produced no image data');

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
        warnings.push(`Page ${pageNum} could not be processed: ${pageErr instanceof Error ? pageErr.message : String(pageErr)}`);
      }
    }

    if (ocrPagesUsed > 0) {
      console.log(`[parse-document] OCR: ${Date.now() - ocrStart}ms pages=${ocrPagesUsed}`);
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
  mimeType: string
): Promise<ExtractionResult> {
  console.log(`[PARSER] Received ${mimeType} (${buffer.length} bytes)`);

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
      result = await extractPdf(buffer);
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

    console.log(
      `[PARSER] Final extraction: ${finalText.length} chars, method=${result.extractionMethod}, pages=${result.pagesProcessed}/${result.pageCount ?? 'n/a'}, warnings=${result.warnings.length}`,
    );

    return { ...result, text: finalText };

  } catch (globalErr) {
    console.error("[PARSER] Fatal error:", globalErr);
    // Preserve specific, classifiable error messages (IMAGE_BASED_PDF: /
    // EXTRACTION_FAILED: / UNSUPPORTED_FILE_TYPE: / DOCUMENT_TOO_LARGE: /
    // timed out) for the caller to map to the right HTTP status — never
    // swallow into a placeholder string that would be mistaken for real
    // document text.
    if (globalErr instanceof Error) throw globalErr;
    throw new Error("An error occurred while parsing the document. Please ensure the file is not password-protected.");
  }
}
