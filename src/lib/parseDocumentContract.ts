/**
 * DealCollab — canonical request contract for /api/chat/parse-document
 * ======================================================================
 * A single, explicit type shared by the client (home/page.tsx) and the
 * server (parse-document/route.ts), so the two can never silently drift
 * into sending/expecting different shapes again. There is exactly ONE way
 * to reference an uploaded file for parsing: the storage bucket + path
 * returned by the signed-upload endpoint. Nothing here constructs or
 * accepts a public storage URL — the server resolves the object itself via
 * its own authenticated Supabase client (see storageDownload.ts).
 */

export interface ParseDocumentRequest {
  bucket: string;
  path: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

/** Fields required to be non-empty strings/numbers before a request is even attempted. */
export type ParseDocumentRequestValidationCode =
  | 'MISSING_BUCKET'
  | 'MISSING_PATH'
  | 'INVALID_PATH'
  | 'MISSING_FILE_NAME';

export interface ParseDocumentRequestValidationResult {
  valid: boolean;
  code?: ParseDocumentRequestValidationCode;
  message?: string;
}

/**
 * Shared validation logic — used by the client to fail fast with an
 * actionable message before ever sending a request, and by the server as
 * the authoritative check (the client check is a UX nicety, never a
 * substitute for server-side validation, since a client can always be
 * bypassed or stale).
 */
export function validateParseDocumentRequest(input: {
  bucket?: unknown;
  path?: unknown;
  fileName?: unknown;
}): ParseDocumentRequestValidationResult {
  if (!input.bucket || typeof input.bucket !== 'string') {
    return { valid: false, code: 'MISSING_BUCKET', message: 'Missing storage bucket' };
  }
  if (!input.path || typeof input.path !== 'string') {
    return { valid: false, code: 'MISSING_PATH', message: 'Missing storage path' };
  }
  if (input.path.includes('..')) {
    return { valid: false, code: 'INVALID_PATH', message: 'Invalid storage path' };
  }
  if (!input.fileName || typeof input.fileName !== 'string') {
    return { valid: false, code: 'MISSING_FILE_NAME', message: 'Missing file name' };
  }
  return { valid: true };
}
