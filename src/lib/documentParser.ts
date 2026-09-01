import mammoth from 'mammoth';

interface PDFParseInstance {
  getText(params?: Record<string, unknown>): Promise<{ total: number; text?: string; pages: Array<{ num: number; text: string }> }>;
  getInfo(params?: Record<string, unknown>): Promise<{ total?: number }>;
  getScreenshot(options: { partial?: number[]; imageDataUrl?: boolean; imageBuffer?: boolean }): Promise<{ pages: Array<{ dataUrl?: string }> }>;
  destroy?: () => Promise<void>;
}

/**
 * 🛠️ ROBUST DOCUMENT PARSING SYSTEM (v4.0)
 * Per-page hybrid pipeline: native text extraction first, OCR fallback for
 * low-text/scanned pages or when native extraction is unavailable.
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

// OCR "succeeded" must mean more than "Tesseract returned without
// throwing" — a misread noisy page can resolve with a handful of garbage
// characters. Require a small amount of actual alphanumeric content before
// counting a page's OCR result as usable.
const OCR_MIN_ALNUM_CHARS = 3;

function hasUsableOcrText(text: string): boolean {
  const alnumCount = (text.match(/[a-zA-Z0-9]/g) || []).length;
  return alnumCount >= OCR_MIN_ALNUM_CHARS;
}

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
 * error message ever reaches the logs.
 */
function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/([?&](?:token|signature|key|secret|auth|apikey)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/https?:\/\/\S+/gi, (url) => url.split('?')[0]);
}

/**
 * Single place every "this step failed" log goes through, so every failure
 * is reported in the same safe, greppable shape.
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
 * pages), up to DOCUMENT_MAX_OCR_PAGES.
 */
async function extractPdf(buffer: Buffer, requestId: string): Promise<ExtractionResult> {
  const tag = `[parse-document][request=${requestId}]`;

  console.error(`${tag} STEP parser-init:start`);
  let parser: PDFParseInstance | null = null;
  try {
    const g = globalThis as unknown as Record<string, unknown>;
    if (typeof g.DOMMatrix === 'undefined') {
      g.DOMMatrix = class DOMMatrix {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        constructor(init?: number[]) {
          if (Array.isArray(init) && init.length >= 6) {
            this.a = init[0]; this.b = init[1]; this.c = init[2];
            this.d = init[3]; this.e = init[4]; this.f = init[5];
          }
        }
      };
    }

    const pdfParseModule = await import('pdf-parse');
    const PDFParseConstructor = (pdfParseModule.PDFParse || (pdfParseModule as unknown as { default: new (opts: { data: Buffer }) => PDFParseInstance }).default) as new (opts: { data: Buffer }) => PDFParseInstance;
    parser = new PDFParseConstructor({ data: buffer });
  } catch (initErr) {
    logParseFailure(requestId, 'PDF_PARSER_INIT_FAILED', initErr);
    throw new Error(`EXTRACTION_FAILED: PDF parser initialization failed (${initErr instanceof Error ? initErr.message : String(initErr)})`);
  }
  console.error(`${tag} STEP parser-init:success`);

  type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
  let worker: TesseractWorker | null = null;

  try {
    console.error(`${tag} STEP native-extraction:start`);
    const nativeStart = Date.now();
    let textResult: { total: number; pages: Array<{ num: number; text: string }> } | null = null;
    let nativeExtractionError: unknown = null;
    try {
      textResult = await withTimeout(parser.getText(), PDF_EXTRACTION_TIMEOUT_MS, 'PDF text extraction');
      console.error(`${tag} native-text extraction: ${Date.now() - nativeStart}ms pages=${textResult.total}`);
      console.error(`${tag} STEP native-extraction:success`);
    } catch (pdfErr) {
      nativeExtractionError = pdfErr;
      logParseFailure(requestId, 'PDF_NATIVE_EXTRACTION_FAILED', pdfErr);
      console.error(`${tag} STEP native-extraction:failure — falling back to OCR`);
    }

    let totalPages: number;
    if (textResult) {
      totalPages = textResult.total || textResult.pages.length || 0;
    } else {
      // Native extraction threw: try getInfo() to determine page count for OCR fallback
      try {
        const info = await withTimeout(parser.getInfo(), PDF_EXTRACTION_TIMEOUT_MS, 'PDF info extraction');
        totalPages = info.total || 0;
      } catch (infoErr) {
        logParseFailure(requestId, 'parser-info-fallback', infoErr);
        throw new Error(
          `EXTRACTION_FAILED: PDF could not be read (native extraction and page-count lookup both failed: ${nativeExtractionError instanceof Error ? nativeExtractionError.message : String(nativeExtractionError)})`,
        );
      }
      if (totalPages === 0) {
        throw new Error('EXTRACTION_FAILED: Native PDF text extraction failed and the document reports 0 pages.');
      }
    }

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
    let ocrAttempted = false;
    const ocrStart = Date.now();

    for (let i = 0; i < pagesToProcess; i++) {
      const pageNum = i + 1;
      const nativeText = (textResult?.pages[i]?.text || '').trim();

      if (nativeText.length >= MIN_PAGE_TEXT_CHARS) {
        perPageText.push(nativeText);
        usedNative = true;
        continue;
      }

      if (ocrPagesUsed >= DOCUMENT_MAX_OCR_PAGES) {
        warnings.push(`Page ${pageNum} has little/no extractable text and the OCR page limit (${DOCUMENT_MAX_OCR_PAGES}) was already reached.`);
        continue;
      }

      if (!ocrAttempted) {
        ocrAttempted = true;
        console.error(`${tag} STEP ocr:start`);
      }

      try {
        if (!worker) {
          console.error(`${tag} STEP ocr-worker-init:start`);
          const workerInitStart = Date.now();
          const { createWorker } = await import('tesseract.js');
          worker = await withTimeout(createWorker('eng'), OCR_WORKER_INIT_TIMEOUT_MS, 'OCR worker initialization');
          console.error(`${tag} STEP ocr-worker-init:success duration_ms=${Date.now() - workerInitStart}`);
        }

        console.error(`${tag} STEP screenshot:start page=${pageNum}`);
        const screenshotStart = Date.now();
        const shot = await withTimeout(
          parser.getScreenshot({ partial: [pageNum], imageDataUrl: true, imageBuffer: false }),
          OCR_PAGE_TIMEOUT_MS,
          `OCR page ${pageNum} rendering`,
        );
        const dataUrl = shot.pages[0]?.dataUrl;
        if (!dataUrl) throw new Error('page render produced no image data');

        const [dataUrlHeader, dataUrlPayload] = dataUrl.split(',', 2);
        const renderedMimeType = dataUrlHeader?.match(/^data:([^;]+)/)?.[1] ?? 'unknown';
        console.error(
          `${tag} STEP screenshot:success page=${pageNum} duration_ms=${Date.now() - screenshotStart} type=${renderedMimeType} size=${dataUrlPayload?.length ?? 0}`,
        );

        console.error(`${tag} STEP ocr-recognize:start page=${pageNum}`);
        const recognizeStart = Date.now();
        const { data: { text: ocrText } } = await withTimeout(
          worker.recognize(dataUrl),
          OCR_PAGE_TIMEOUT_MS,
          `OCR page ${pageNum} recognition`,
        );
        console.error(
          `${tag} STEP ocr-recognize:success page=${pageNum} duration_ms=${Date.now() - recognizeStart} chars=${ocrText.length}`,
        );

        ocrPagesUsed++;
        if (hasUsableOcrText(ocrText)) {
          perPageText.push(ocrText.trim());
          usedOcr = true;
        } else {
          warnings.push(`Page ${pageNum} produced no readable text (native extraction and OCR both came back empty or unusable).`);
        }
      } catch (pageErr) {
        ocrPagesUsed++;
        logParseFailure(requestId, 'ocr-or-screenshot', pageErr, { page: pageNum });
        warnings.push(`Page ${pageNum} could not be processed: ${pageErr instanceof Error ? pageErr.message : String(pageErr)}`);
      }
    }

    if (ocrPagesUsed > 0) {
      console.error(`${tag} STEP ocr:complete pages=${ocrPagesUsed}`);
      console.error(`${tag} OCR: ${Date.now() - ocrStart}ms pages=${ocrPagesUsed}`);
    }

    let text = perPageText.join('\n\n');
    if (text.length > DOCUMENT_MAX_TEXT_LENGTH) {
      text = text.slice(0, DOCUMENT_MAX_TEXT_LENGTH);
      warnings.push(`Extracted text was truncated to ${DOCUMENT_MAX_TEXT_LENGTH} characters.`);
    }

    if (!text.trim()) {
      if (ocrAttempted) {
        throw new Error(
          `OCR_FAILED: OCR was attempted on ${ocrPagesUsed} page(s) but did not produce usable text.`,
        );
      }
      if (nativeExtractionError) {
        throw new Error(
          `EXTRACTION_FAILED: Native PDF text extraction failed and no OCR fallback could be completed (${nativeExtractionError instanceof Error ? nativeExtractionError.message : String(nativeExtractionError)}).`,
        );
      }
      throw new Error(
        'IMAGE_BASED_PDF: No readable text could be extracted from any page and OCR was not attempted.',
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
    if (worker) {
      await worker.terminate().catch(() => {});
    }
    if (parser && typeof parser.destroy === 'function') {
      await parser.destroy().catch(() => {});
    }
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

    // 4. Unsupported Handling
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
    if (globalErr instanceof Error) throw globalErr;
    throw new Error("EXTRACTION_FAILED: An error occurred while parsing the document. Please ensure the file is not password-protected.");
  }
}
