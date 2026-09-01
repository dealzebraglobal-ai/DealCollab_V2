import { auth } from '@/auth';
import { createHash } from 'node:crypto';
import { extractTextFromFile, logParseFailure, type ExtractionResult } from '@/lib/documentParser';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { checkFileSignature } from '@/lib/fileSignature';
import { downloadFromStorage } from '@/lib/storageDownload';
import { validateParseDocumentRequest, type ParseDocumentRequest } from '@/lib/parseDocumentContract';

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
      console.error(`${tag} HTTP401 reason=no-session`);
      return NextResponse.json({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED', retryable: false }, { status: 401 });
    }
    const userId = session.user.id;
    console.error(`${tag} STEP auth:success`);

    // SECURITY: this route makes real OpenAI/Groq calls and Supabase Storage
    // uploads per request — previously unbounded, so an authenticated user
    // (or a compromised session) could flood it for cost/DoS. Per-user,
    // not per-IP, since it requires auth and users can be behind shared IPs.
    const rl = checkRateLimit(`parse-document:user:${userId}`, 10, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many document uploads — please wait before trying again', code: 'RATE_LIMITED', retryable: true }, { status: 429 });
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
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        // A malformed/empty JSON body previously fell through uncaught into
        // the generic catch-all below, which returns 500 for anything it
        // doesn't recognize — a client-side mistake shouldn't look like a
        // server failure.
        console.error(`${tag} HTTP400 ${JSON.stringify({ reason: 'invalid-json-body' })}`);
        return NextResponse.json({ success: false, error: 'Invalid JSON in request body', code: 'INVALID_REQUEST', retryable: false }, { status: 400 });
      }
      const { bucket, path, fileName, fileType, fileSize } = body as Partial<ParseDocumentRequest>;
      // Diagnostic only — reports which fields were present, never the
      // actual path/URL/token values (path can reveal another user's email
      // prefix if logged in full; fileName is user-controlled but harmless).
      console.error(
        `${tag} REQUEST:body-parsed ${JSON.stringify({ contentType: 'application/json', hasBucket: Boolean(bucket), hasPath: Boolean(path), fileName: fileName || null, fileType: fileType || null, fileSize: fileSize || null })}`,
      );

      // Single shared validator (src/lib/parseDocumentContract.ts) — the
      // exact same function the client runs before ever sending this
      // request, so "the request the client sends" and "the request the
      // server accepts" can never silently diverge into two different
      // contracts again.
      const shapeCheck = validateParseDocumentRequest({ bucket, path, fileName });
      if (!shapeCheck.valid) {
        console.error(`${tag} HTTP400 ${JSON.stringify({ reason: shapeCheck.code, hasBucket: Boolean(bucket), hasPath: Boolean(path), hasFileName: Boolean(fileName) })}`);
        return NextResponse.json(
          { success: false, error: shapeCheck.message, code: shapeCheck.code, retryable: false },
          { status: 400 }
        );
      }

      // Narrowed, non-optional locals now that validateParseDocumentRequest
      // has confirmed bucket/path/fileName are all present strings — TS
      // can't infer this from a function call on the original variables,
      // so this is the one place that makes it explicit for everything
      // below.
      const validBucket: string = bucket!;
      const validPath: string = path!;
      const validFileName: string = fileName!;

      // SECURITY: this route only ever reads from the 'pdfs' bucket, and
      // only an object path namespaced under the CALLING user's own upload
      // folder — the same email-derived prefix /api/profile/upload/signed-url
      // mints when it hands out an upload URL. Without this, an
      // authenticated user could pass another user's bucket/path and have
      // the server download and parse their document (IDOR). This replaces
      // the previous "fetch whatever URL the browser sends" approach, which
      // had no such check at all (any allowlisted-host URL was fetched).
      if (validBucket !== 'pdfs') {
        console.error(`${tag} HTTP400 ${JSON.stringify({ reason: 'invalid-bucket', bucket: validBucket })}`);
        return NextResponse.json({ success: false, error: 'Invalid storage bucket', code: 'INVALID_REQUEST', retryable: false }, { status: 400 });
      }
      const ownerPrefix = `${(session.user.email || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}/`;
      if (!session.user.email || !validPath.startsWith(ownerPrefix)) {
        console.error(`${tag} FAILURE step=storage-download error_name=Forbidden error_message=path does not belong to the authenticated user`);
        console.error(`${tag} HTTP403 ${JSON.stringify({ reason: 'path-owner-mismatch', hasSessionEmail: Boolean(session.user.email) })}`);
        return NextResponse.json({ success: false, error: 'You do not have access to this file', code: 'STORAGE_ACCESS_DENIED', retryable: false }, { status: 403 });
      }

      // fileSize here is a client-supplied number, not yet verified against
      // the real download — file.size is overwritten below with the actual
      // buffer length before the MAX_FILE_SIZE check runs.
      file = { name: validFileName, type: fileType || '', size: fileSize || 0 };
      isDirectUpload = true;

      // Server-authenticated download via the Supabase Storage SDK —
      // bounded with the same timeout previously applied to the fetch()
      // call, so a stalled storage response still can't hold the request
      // open indefinitely.
      console.error(`${tag} STEP storage-download:start`);
      const downloadStart = Date.now();
      // Bounded retry ONLY for STORAGE_OBJECT_NOT_FOUND: Supabase Storage
      // reads can very briefly race a just-completed client-side PUT
      // (eventual consistency between the upload path and the read path).
      // This does NOT retry malformed requests, auth/ownership failures, or
      // genuine download errors (STORAGE_DOWNLOAD_FAILED) — those are not
      // transient and retrying them would just waste the request's time
      // budget.
      const NOT_FOUND_RETRY_DELAYS_MS = [250, 500];
      const downloadWithTimeout = () =>
        Promise.race([
          downloadFromStorage(supabase, validBucket, validPath),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`STORAGE_DOWNLOAD_TIMEOUT: File download timed out after ${DOCUMENT_DOWNLOAD_TIMEOUT_MS}ms`)), DOCUMENT_DOWNLOAD_TIMEOUT_MS)),
        ]);
      let downloadResult = await downloadWithTimeout();
      for (let i = 0; !downloadResult.success && downloadResult.code === 'STORAGE_OBJECT_NOT_FOUND' && i < NOT_FOUND_RETRY_DELAYS_MS.length; i++) {
        console.error(`${tag} STEP storage-download:retry attempt=${i + 1} delay_ms=${NOT_FOUND_RETRY_DELAYS_MS[i]}`);
        await new Promise((resolve) => setTimeout(resolve, NOT_FOUND_RETRY_DELAYS_MS[i]));
        downloadResult = await downloadWithTimeout();
      }

      if (!downloadResult.success) {
        logParseFailure(requestId, 'storage-download', new Error(downloadResult.message));
        console.error(`${tag} HTTP${downloadResult.status} ${JSON.stringify({ reason: 'storage-download-failed', code: downloadResult.code })}`);
        return NextResponse.json(
          { success: false, error: downloadResult.message, code: downloadResult.code, retryable: downloadResult.code === 'STORAGE_DOWNLOAD_FAILED' },
          { status: downloadResult.status },
        );
      }

      buffer = downloadResult.buffer;
      // Re-derive size from the actual downloaded bytes — never trust the
      // client-supplied fileSize for the size-limit check below.
      file.size = buffer.length;
      // For the DB record / client display only — never used to fetch the
      // file for parsing (that's the whole point of this fix). Uses the
      // SDK's own URL builder rather than string-concatenating one.
      publicUrl = supabase.storage.from(validBucket).getPublicUrl(validPath).data.publicUrl;
      console.error(
        `${tag} STEP storage-download:success duration_ms=${Date.now() - downloadStart}`,
      );
      console.error(`${tag} storage-download size=${buffer.length} content_type=${downloadResult.contentType ?? 'unknown'}`);
      console.error(
        `${tag} file-buffer-ready size=${buffer.length} sha256=${createHash('sha256').update(buffer).digest('hex')} signature=${buffer.subarray(0, 5).toString('latin1') === '%PDF-' ? 'valid-pdf-header' : 'NOT-pdf-header'}`,
      );
    } else {
      // Parse multipart form data
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        console.error(`${tag} HTTP400 ${JSON.stringify({ reason: 'invalid-form-data', contentType })}`);
        return NextResponse.json(
          { success: false, error: 'Invalid form data. Make sure the file is sent as multipart/form-data.', code: 'INVALID_REQUEST', retryable: false },
          { status: 400 }
        );
      }

      const formFile = formData.get('file') as File | null;
      if (!formFile) {
        console.error(`${tag} HTTP400 ${JSON.stringify({ reason: 'no-file-field-in-form-data', contentType })}`);
        return NextResponse.json(
          { success: false, error: 'No file provided. Send the file as a "file" field in the form data.', code: 'INVALID_REQUEST', retryable: false },
          { status: 400 }
        );
      }
      console.error(
        `${tag} REQUEST:body-parsed ${JSON.stringify({ contentType: 'multipart/form-data', fileName: formFile.name, fileType: formFile.type || null, fileSize: formFile.size })}`,
      );

      file = { name: formFile.name, type: formFile.type || '', size: formFile.size };
      isDirectUpload = false;

      console.log(`[PARSE] Processing form-data file: ${file.name} | Type: ${file.type} | Size: ${(file.size / 1024).toFixed(1)}KB`);

      // Convert File to Buffer
      const arrayBuffer = await formFile.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      console.error(
        `${tag} file-buffer-ready size=${buffer.length} sha256=${createHash('sha256').update(buffer).digest('hex')} signature=${buffer.subarray(0, 5).toString('latin1') === '%PDF-' ? 'valid-pdf-header' : 'NOT-pdf-header'}`,
      );
    }
    console.error(`${tag} STEP file-acquisition:success`);

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      console.error(`${tag} HTTP413 ${JSON.stringify({ reason: 'file-too-large', size: file.size, maxSize: MAX_FILE_SIZE })}`);
      return NextResponse.json(
        { success: false, error: `File too large. Maximum size is 10MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`, code: 'FILE_TOO_LARGE', retryable: false },
        { status: 413 }
      );
    }

    // Validate file type — 415 (Unsupported Media Type) is the more precise
    // status for "the declared content-type isn't one we handle," distinct
    // from 400 (malformed request shape) used elsewhere in this route.
    const mimeType = file.type || '';
    if (!SUPPORTED_TYPES[mimeType]) {
      console.error(`${tag} HTTP415 ${JSON.stringify({ reason: 'unsupported-mime-type', mimeType: mimeType || null })}`);
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported file type: ${mimeType || 'unknown'}. Supported types: PDF, DOCX, PPTX, TXT, JPG, PNG, WEBP.`,
          code: 'UNSUPPORTED_FILE_TYPE',
          retryable: false,
        },
        { status: 415 }
      );
    }

    // SECURITY: Content-Type (browser-supplied) and filename extension are
    // both trivially spoofable — a renamed executable claiming to be a PDF
    // would previously sail through. Verify the actual file bytes match the
    // claimed type before it's uploaded to storage or handed to the parser.
    //
    // This is deliberately classified as FILE_CONTENT_TYPE_MISMATCH (422),
    // never IMAGE_BASED_PDF — a MIME/byte mismatch is not evidence the PDF
    // is scanned, and telling the user to "convert this PDF to DOCX" would
    // be actively wrong when the actual problem is that the bytes aren't a
    // PDF at all.
    console.error(`${tag} STEP byte-validation:start`);
    const sigCheck = checkFileSignature(buffer, mimeType);
    if (!sigCheck.valid) {
      logParseFailure(requestId, 'byte-validation', new Error(sigCheck.reason));
      console.error(`${tag} HTTP422 ${JSON.stringify({ reason: 'file-content-type-mismatch', mimeType, size: buffer.length })}`);
      return NextResponse.json(
        { success: false, error: 'The uploaded file content does not match its declared file type.', code: 'FILE_CONTENT_TYPE_MISMATCH', retryable: false },
        { status: 422 },
      );
    }
    console.error(`${tag} STEP byte-validation:success type=${mimeType}`);

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
    console.error(`${tag} STEP parser:start`);
    try {
      extraction = await Promise.race([
        extractTextFromFile(buffer, mimeType, requestId),
        new Promise<ExtractionResult>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT: Document parsing timed out. Please try a smaller or text-based document.")), DOCUMENT_EXTRACTION_TIMEOUT_MS))
      ]);
      console.error(
        `${tag} extraction_ms=${Date.now() - extractionStart} chars=${extraction.text.length} method=${extraction.extractionMethod} pages=${extraction.pagesProcessed}/${extraction.pageCount ?? 'n/a'} warnings=${extraction.warnings.length}`,
      );
      console.error(
        `${tag} STEP parser:success method=${extraction.extractionMethod} pages=${extraction.pagesProcessed} textLength=${extraction.text.length}`,
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
    // AI structuring is a separate concern from document extraction — the
    // document itself was already read successfully by this point, so an AI
    // failure here must never surface as "the document could not be read."
    // Tracked explicitly (rather than inferred from an empty structuredData,
    // which a document with genuinely no structurable content would also
    // produce) so the frontend can show an accurate, distinct message.
    let aiStructuringFailed = false;
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
        aiStructuringFailed = true;
      }
      console.error(`${tag} AI extraction: ${Date.now() - aiStart}ms`);
      console.error(`${tag} STEP ai:success`);
    } catch (intelligenceErr) {
      logParseFailure(requestId, 'ai', intelligenceErr);
      console.error(`[PARSE] cleanAndStructureDocument failed after ${Date.now() - aiStart}ms:`, intelligenceErr);
      // Continue with empty structuredData — document text is still usable
      aiStructuringFailed = true;
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
        aiStructuringFailed,
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
      aiStructuringFailed,
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
    let code = 'INTERNAL_PARSING_ERROR';
    let step = 'unclassified';
    let retryable = false;
    if (msg.includes('DOCUMENT_TOO_LARGE')) {
      status = 413;
      code = 'DOCUMENT_TOO_LARGE';
      step = 'limits';
    } else if (msg.includes('PDF_PARSER_INIT_FAILED')) {
      status = 422;
      code = 'PDF_PARSER_INIT_FAILED';
      step = 'parser-init';
    } else if (msg.includes('OCR_FAILED')) {
      // Distinct from IMAGE_BASED_PDF: OCR was genuinely attempted and
      // exhausted, not skipped — the frontend must not tell the user "we
      // cannot read images" for this case, since OCR support exists.
      status = 422;
      code = 'OCR_FAILED';
      step = 'ocr';
      retryable = true;
    } else if (msg.includes('IMAGE_BASED_PDF')) {
      status = 422;
      code = 'IMAGE_BASED_PDF';
      step = 'quality-gate';
    } else if (msg.includes('UNSUPPORTED_FILE_TYPE')) {
      status = 415;
      code = 'UNSUPPORTED_FILE_TYPE';
      step = 'mime-validation';
    } else if (msg.includes('EXTRACTION_FAILED')) {
      status = 422;
      code = 'EXTRACTION_FAILED';
      step = 'extraction';
    } else if (msg.includes('STORAGE_DOWNLOAD_TIMEOUT')) {
      status = 504;
      code = 'STORAGE_DOWNLOAD_TIMEOUT';
      step = 'storage-download';
      retryable = true;
    } else if (msg.includes('TIMEOUT') || msg.toLowerCase().includes('timed out')) {
      status = 504;
      code = 'DOCUMENT_PARSE_TIMEOUT';
      step = 'parser-timeout';
      retryable = true;
    } else {
      // Genuinely unexpected (DB, storage, provider) failures — worth a retry.
      retryable = true;
    }

    return NextResponse.json(
      {
        success: false,
        error: `Document processing failed: ${err.message}`,
        message: err.message,
        code,
        step,
        requestId,
        retryable,
      },
      { status }
    );
  }
}
