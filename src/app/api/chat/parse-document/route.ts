import { auth } from '@/auth';
import { extractTextFromFile, logParseFailure, type ExtractionResult } from '@/lib/documentParser';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { isAllowedFileUrl } from '@/lib/ssrfGuard';
import { checkFileSignature } from '@/lib/fileSignature';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Hard platform ceiling — actual processing is now bounded well below this (see timeouts below)

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Maximum file size — configurable via env, defaults preserve prior behavior.
const MAX_FILE_SIZE = envInt('DOCUMENT_MAX_FILE_SIZE_MB', 10) * 1024 * 1024;

// Timeouts — every external/native operation is bounded so a request can
// never sit for minutes with an ambiguous outcome. documentParser.ts bounds
// its own internal steps (pdf-parse, OCR worker init, per-page OCR); this
// extraction timeout is the outer safety net.
const DOCUMENT_DOWNLOAD_TIMEOUT_MS = envInt('DOCUMENT_DOWNLOAD_TIMEOUT_MS', 20_000);
const DOCUMENT_EXTRACTION_TIMEOUT_MS = envInt('DOCUMENT_PARSE_TIMEOUT_MS', 120_000);
const AI_STRUCTURING_TIMEOUT_MS = envInt('AI_STRUCTURING_TIMEOUT_MS', 15_000);

// Supported MIME types
const SUPPORTED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'text/plain': 'txt',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function POST(req: NextRequest) {
  const requestStart = Date.now();
  // Vercel sets x-vercel-id on every proxied request — using it (when present)
  // lets a log line be pasted directly into the Vercel dashboard's own
  // request search. Falls back to a random id locally / if absent.
  const requestId = req.headers.get('x-vercel-id') || crypto.randomUUID();
  const tag = `[parse-document][request=${requestId}]`;
  try {
    console.error(`${tag} STEP request:start`);
    // Safe, one-time diagnostics: presence-only (never values) for every env
    // var this route/its dependencies use, plus runtime identity — added
    // specifically because localhost runs Node v24.x and Vercel's actual
    // Node major version for this deployment has not been independently
    // confirmed from this environment.
    console.error(
      `${tag} runtime node=${process.version} platform=${process.platform} arch=${process.arch} ` +
      `OPENAI_API_KEY=${process.env.OPENAI_API_KEY ? 'present' : 'missing'} ` +
      `GROQ_API_KEY=${process.env.GROQ_API_KEY ? 'present' : 'missing'} ` +
      `NEXT_PUBLIC_SUPABASE_URL=${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'present' : 'missing'} ` +
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'present' : 'missing'} ` +
      `SUPABASE_SERVICE_ROLE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'present' : 'missing'}`,
    );

    // Auth check
    console.error(`${tag} STEP auth:start`);
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    console.error(`${tag} STEP auth:success`);

    // SECURITY: this route makes real OpenAI/Groq calls and Supabase Storage
    // uploads per request — previously unbounded, so an authenticated user
    // (or a compromised session) could flood it for cost/DoS. Per-user,
    // not per-IP, since it requires auth and users can be behind shared IPs.
    const rl = checkRateLimit(`parse-document:user:${userId}`, 10, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many document uploads — please wait before trying again' }, { status: 429 });
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error("Supabase client failed to initialize");

    let file: { name: string; type: string; size: number } | null = null;
    let buffer: Buffer;
    let publicUrl = '';
    let isDirectUpload = false;

    console.error(`${tag} STEP file-acquisition:start`);
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const { fileUrl, fileName, fileType, fileSize } = body;

      if (!fileUrl || !fileName) {
        return NextResponse.json(
          { success: false, error: 'Missing fileUrl or fileName in request body' },
          { status: 400 }
        );
      }

      if (!isAllowedFileUrl(fileUrl, process.env.NEXT_PUBLIC_SUPABASE_URL)) {
        console.error('[PARSE] Rejected fileUrl outside the allowed Supabase storage host:', fileUrl);
        return NextResponse.json({ success: false, error: 'Invalid file URL' }, { status: 400 });
      }

      // fileSize here is a client-supplied number, not yet verified against
      // the real download — file.size is overwritten below with the actual
      // buffer length before the MAX_FILE_SIZE check runs.
      file = { name: fileName, type: fileType || '', size: fileSize || 0 };
      publicUrl = fileUrl;
      isDirectUpload = true;

      console.log(`[PARSE] Processing pre-uploaded file from URL: ${fileUrl} | Name: ${fileName}`);

      // SECURITY (SSRF): fetch() follows redirects by default — the
      // allowlist check above only validates the URL we're ABOUT to
      // request, not wherever a 3xx response might point next. A
      // compromised/misconfigured intermediary could redirect an
      // allowlisted Supabase URL to an internal address. redirect: 'error'
      // makes fetch throw instead of silently following, since legitimate
      // Supabase Storage public URLs never redirect cross-origin.
      //
      // Bounded with an explicit timeout — an unbounded download here would
      // let a slow/stalled storage response hold the whole request open
      // with no controlled failure (this was one of the four unbounded
      // external calls behind the ~247s production hangs).
      const downloadStart = Date.now();
      const downloadController = new AbortController();
      const downloadTimeout = setTimeout(() => downloadController.abort(), DOCUMENT_DOWNLOAD_TIMEOUT_MS);
      let fileRes: Response;
      try {
        fileRes = await fetch(fileUrl, { redirect: 'error', signal: downloadController.signal });
      } catch (downloadErr) {
        if (downloadErr instanceof Error && downloadErr.name === 'AbortError') {
          throw new Error(`DOWNLOAD_TIMEOUT: File download timed out after ${DOCUMENT_DOWNLOAD_TIMEOUT_MS}ms`);
        }
        throw downloadErr;
      } finally {
        clearTimeout(downloadTimeout);
      }
      if (!fileRes.ok) {
        throw new Error(`Failed to fetch pre-uploaded file from URL: ${fileRes.statusText}`);
      }
      console.error(`${tag} file acquisition: ${Date.now() - downloadStart}ms`);

      // SECURITY: reject an oversized download before buffering it into
      // memory, using the server-reported Content-Length — don't rely on
      // the client-supplied fileSize field for this decision.
      const contentLength = Number(fileRes.headers.get('content-length') || 0);
      if (contentLength > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: `File too large. Maximum size is 10MB. Your file is ${(contentLength / 1024 / 1024).toFixed(1)}MB.` },
          { status: 413 }
        );
      }

      const arrayBuffer = await fileRes.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      // Re-derive size from the actual downloaded bytes — never trust the
      // client-supplied fileSize for the size-limit check below.
      file.size = buffer.length;
    } else {
      // Parse multipart form data
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid form data. Make sure the file is sent as multipart/form-data.' },
          { status: 400 }
        );
      }

      const formFile = formData.get('file') as File | null;
      if (!formFile) {
        return NextResponse.json(
          { success: false, error: 'No file provided. Send the file as a "file" field in the form data.' },
          { status: 400 }
        );
      }

      file = { name: formFile.name, type: formFile.type || '', size: formFile.size };
      isDirectUpload = false;

      console.log(`[PARSE] Processing form-data file: ${file.name} | Type: ${file.type} | Size: ${(file.size / 1024).toFixed(1)}KB`);

      // Convert File to Buffer
      const arrayBuffer = await formFile.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }
    console.error(`${tag} STEP file-acquisition:success`);

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File too large. Maximum size is 10MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.` },
        { status: 413 }
      );
    }

    // Validate file type
    const mimeType = file.type || '';
    if (!SUPPORTED_TYPES[mimeType]) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported file type: ${mimeType || 'unknown'}. Supported types: PDF, DOCX, PPTX, TXT, JPG, PNG, WEBP.`,
        },
        { status: 400 }
      );
    }

    // SECURITY: Content-Type (browser-supplied) and filename extension are
    // both trivially spoofable — a renamed executable claiming to be a PDF
    // would previously sail through. Verify the actual file bytes match the
    // claimed type before it's uploaded to storage or handed to the parser.
    const sigCheck = checkFileSignature(buffer, mimeType);
    if (!sigCheck.valid) {
      console.error(`[PARSE] Rejected file with mismatched signature: claimed=${mimeType} name=${file.name} reason=${sigCheck.reason}`);
      return NextResponse.json({ success: false, error: 'File content does not match the declared file type.' }, { status: 400 });
    }

    if (!isDirectUpload) {
      // 1. UPLOAD TO STORAGE (with retry logic for resilience against network timeouts)
      const fileName = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

      let uploadErr = null;
      const maxRetries = 5; // Increased for better resilience

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[STORAGE] Upload attempt ${attempt}/${maxRetries} for ${fileName}...`);
          const result = await supabase.storage
            .from('pdfs')
            .upload(fileName, buffer, {
              contentType: mimeType,
              upsert: true
            });

          if (!result.error) {
            uploadErr = null;
            console.log(`[STORAGE] Upload successful on attempt ${attempt}`);
            break;
          }

          uploadErr = result.error;
          console.warn(`[STORAGE] Upload attempt ${attempt} failed:`, uploadErr.message);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          uploadErr = { message: msg };
          console.warn(`[STORAGE] Upload attempt ${attempt} threw error:`, msg);
        }

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`[STORAGE] Waiting ${delay}ms before next attempt...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (uploadErr) {
        console.error('[STORAGE] Final upload failure after all attempts:', uploadErr);
        const isTimeout = uploadErr.message?.toLowerCase().includes('timeout') || uploadErr.message?.toLowerCase().includes('fetch failed');
        throw new Error(`Failed to upload document${isTimeout ? ' due to network timeout or unstable connection' : ''}: ${uploadErr.message}. (Size: ${(file.size / 1024).toFixed(1)}KB)`);
      }

      // 2. GET PUBLIC URL
      const { data: { publicUrl: generatedPublicUrl } } = supabase.storage
        .from('pdfs')
        .getPublicUrl(fileName);
      publicUrl = generatedPublicUrl;
    }

    // 3. EXTRACT TEXT
    // documentParser.ts bounds its own internal steps (pdf-parse, OCR worker
    // init, per-page OCR) to well under a minute total; this is the outer
    // safety net in case a future extraction path doesn't self-bound.
    let extraction: ExtractionResult;
    const extractionStart = Date.now();
    try {
      extraction = await Promise.race([
        extractTextFromFile(buffer, mimeType, requestId),
        new Promise<ExtractionResult>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT: Document parsing timed out. Please try a smaller or text-based document.")), DOCUMENT_EXTRACTION_TIMEOUT_MS))
      ]);
      console.error(
        `${tag} extraction_ms=${Date.now() - extractionStart} chars=${extraction.text.length} method=${extraction.extractionMethod} pages=${extraction.pagesProcessed}/${extraction.pageCount ?? 'n/a'} warnings=${extraction.warnings.length}`,
      );
    } catch (parseErr) {
      const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error(`[PARSE] Extraction failed after ${Date.now() - extractionStart}ms:`, errMsg);
      throw new Error(`Extraction failed: ${errMsg}`);
    }

    const cleanText = extraction.text.trim();

    // 4. GENERATE STRUCTURED INTELLIGENCE (Expert Engine)
    const { cleanAndStructureDocument } = await import('@/lib/intelligenceEngine');
    let structuredData: Record<string, unknown> = {};
    const aiStart = Date.now();
    console.error(`${tag} STEP ai:start`);
    try {
      const raw = await Promise.race([
        cleanAndStructureDocument(cleanText),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Structuring timed out")), AI_STRUCTURING_TIMEOUT_MS))
      ]);
      // Guard: if Groq returned HTML or a non-object, discard it
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        structuredData = raw as unknown as Record<string, unknown>;
      } else {
        console.warn('[PARSE] cleanAndStructureDocument returned non-object — using empty fallback');
      }
      console.error(`${tag} AI extraction: ${Date.now() - aiStart}ms`);
      console.error(`${tag} STEP ai:success`);
    } catch (intelligenceErr) {
      logParseFailure(requestId, 'ai', intelligenceErr);
      console.error(`[PARSE] cleanAndStructureDocument failed after ${Date.now() - aiStart}ms:`, intelligenceErr);
      // Continue with empty structuredData — document text is still usable
    }

    // 5. PERSIST IN DOCUMENTS TABLE (Resilient Insertion)
    let docData: { id: string } | null = null;
    try {
      const insertPayload = {
        user_id: userId || null,
        name: file.name || 'Untitled Document',
        url: publicUrl || null,
        extracted_text: cleanText || null,
        structured_data: structuredData || null,
      };

      console.log(`[DB] Attempting resilient insert into 'documents' table...`);
      const { data, error: dbErr } = await supabase
        .from('documents')
        .insert([insertPayload])
        .select('id')
        .single();

      if (dbErr) {
        console.error('[DB] PRIMARY INSERT FAILED:', {
          code: dbErr.code,
          message: dbErr.message,
          hint: dbErr.hint,
          details: dbErr.details,
          payload: Object.keys(insertPayload)
        });

        // Defensive: If it's a "column not found" error, we throw a clear instruction
        if (dbErr.code === '42703') {
          throw new Error(`Database Schema Mismatch: A required column is missing. Please run the migration script: ${dbErr.message}`);
        }
        throw dbErr;
      }
      docData = data;
    } catch (insertErr: unknown) {
      const errorMsg = insertErr instanceof Error ? insertErr.message : String(insertErr);
      console.error('[DB] Document persistence critical failure:', errorMsg);
      // If DB persistence fails, we still return the text so the user doesn't lose progress,
      // but we warn about the persistence failure.
      return NextResponse.json({
        success: true, // Partial success (extraction worked)
        text: cleanText,
        documentUrl: publicUrl,
        pageCount: extraction.pageCount,
        extractionMethod: extraction.extractionMethod,
        pagesProcessed: extraction.pagesProcessed,
        warnings: extraction.warnings,
        warning: 'Document text was extracted but could not be saved to history. Please check database schema.',
        error: errorMsg
      });
    }

    // 6. AUTO-CREATE CHAT SESSION (Seeded with document intelligence)
    let chatData: { id: string } | null = null;
    if (docData?.id) {
      // Seed initial state from structured data
      const { initializeStateFromDocument } = await import('@/lib/promptRouter');
      const initialState = initializeStateFromDocument((structuredData as unknown as Record<string, unknown>) || {});

      const { data, error: chatErr } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: userId,
          document_id: docData.id,
          title: `Deal Intake: ${file.name}`,
          state: initialState
        })
        .select('id')
        .single();

      if (chatErr) {
        console.error('[DB] Chat session creation failed:', chatErr);
      } else {
        chatData = data;
      }
    }

    console.error(`${tag} completed total_ms=${Date.now() - requestStart} method=${extraction.extractionMethod}`);
    console.error(`${tag} STEP response:success`);

    return NextResponse.json({
      success: true,
      text: cleanText,
      documentUrl: publicUrl,
      documentId: docData?.id || null,
      chatId: chatData?.id || null,
      structured: structuredData,
      pageCount: extraction.pageCount,
      extractionMethod: extraction.extractionMethod,
      pagesProcessed: extraction.pagesProcessed,
      partial: extraction.warnings.length > 0,
      warnings: extraction.warnings,
      metadata: {
        fileName: file.name,
        fileType: SUPPORTED_TYPES[mimeType],
        mimeType,
        fileSize: file.size,
      }
    });

  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`${tag} failed total_ms=${Date.now() - requestStart}`, err);
    // documentParser.ts logs its own more specific STEP FAILURE (parser-init/
    // native-extraction/screenshot/ocr) before this error ever reaches here;
    // this top-level marker guarantees a FAILURE line is emitted even for a
    // failure this route doesn't have a named step for (auth, storage, DB,
    // or a genuinely unclassified exception).
    logParseFailure(requestId, 'unclassified', err);

    // Classify the failure so the response is never an ambiguous 500 for
    // things that are really "this document can't be parsed" (422) or
    // "an external step ran out of time" (504) — see documentParser.ts and
    // the download/extraction timeouts above for where these are thrown.
    const msg = err.message;
    let status = 500;
    let code = 'PARSE_FAILED';
    let retryable = false;
    if (msg.includes('DOCUMENT_TOO_LARGE')) {
      status = 413;
      code = 'DOCUMENT_TOO_LARGE';
    } else if (msg.includes('IMAGE_BASED_PDF') || msg.includes('EXTRACTION_FAILED') || msg.includes('UNSUPPORTED_FILE_TYPE')) {
      status = 422;
      code = msg.includes('IMAGE_BASED_PDF') ? 'IMAGE_BASED_PDF' : msg.includes('UNSUPPORTED_FILE_TYPE') ? 'UNSUPPORTED_FILE_TYPE' : 'EXTRACTION_FAILED';
    } else if (msg.includes('TIMEOUT') || msg.toLowerCase().includes('timed out')) {
      status = 504;
      code = 'DOCUMENT_PARSE_TIMEOUT';
      retryable = true;
    } else {
      // Genuinely unexpected (DB, storage, provider) failures — worth a retry.
      retryable = true;
    }

    return NextResponse.json(
      { success: false, error: `Document processing failed: ${err.message}`, code, retryable },
      { status }
    );
  }
}
