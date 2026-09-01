import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Regression tests for the JSON request-contract validation in
 * /api/chat/parse-document — added while investigating a production 400
 * (Request ID l4flg-1788165322781-ab7add5a4234, 749ms, zero external calls).
 *
 * These exercise the ACTUAL route handler (not a reimplementation of its
 * logic) against every payload shape that can reach a 400/401/403 response
 * BEFORE the Supabase Storage download — i.e. exactly the class of failure
 * that produces "0 external API calls" in Vercel's request insights. Only
 * auth, rate-limiting, and the Supabase client constructor are mocked;
 * storageDownload/documentParser are mocked too so a test that accidentally
 * reaches file acquisition fails loudly instead of hitting a real network
 * call.
 */

const authMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn(() => ({ allowed: true })));
const downloadFromStorageMock = vi.hoisted(() => vi.fn());

vi.mock('@/auth', () => ({ auth: authMock }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock('@/lib/storageDownload', () => ({ downloadFromStorage: downloadFromStorageMock }));
vi.mock('@/lib/documentParser', () => ({
  extractTextFromFile: vi.fn(),
  logParseFailure: vi.fn(),
}));
vi.mock('@/lib/fileSignature', () => ({ checkFileSignature: vi.fn(() => ({ valid: true })) }));
vi.mock('@/lib/intelligenceEngine', () => ({ cleanAndStructureDocument: vi.fn(async () => ({})) }));
vi.mock('@/utils/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    storage: {
      from: () => ({
        download: vi.fn(),
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/public' } }),
      }),
    },
    from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  })),
}));

function jsonRequest(body: unknown, contentType = 'application/json') {
  return new NextRequest('http://localhost/api/chat/parse-document', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat/parse-document — request-contract validation (400/401/403 paths)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks() only clears call history, not queued
    // mockResolvedValueOnce() implementations — reset this one explicitly so
    // an exhausted/unconsumed retry-sequence from one test can never bleed
    // into the next.
    downloadFromStorageMock.mockReset();
    checkRateLimitMock.mockReturnValue({ allowed: true });
    authMock.mockResolvedValue({ user: { id: 'user-1', email: 'diagnostic-test@dealcollab.ai' } });
  });

  it('unauthenticated request: 401, never reaches file acquisition', async () => {
    authMock.mockResolvedValue(null);
    const { POST } = await import('./route');

    const res = await POST(jsonRequest({ bucket: 'pdfs', path: 'diagnostic_test_dealcollab_ai/x.pdf', fileName: 'x.pdf' }));

    expect(res.status).toBe(401);
    expect(downloadFromStorageMock).not.toHaveBeenCalled();
  });

  it('JSON body missing "path" (e.g. an older client still on the pre-storagePath contract, or a truncated payload): 400 MISSING_PATH, zero storage calls — this is the exact signature of the reported production 400 (fast, no external GET)', async () => {
    const { POST } = await import('./route');

    const res = await POST(jsonRequest({ bucket: 'pdfs', fileName: 'Project_Damodar.pdf', fileType: 'application/pdf', fileSize: 975694 }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.code).toBe('MISSING_PATH');
    expect(downloadFromStorageMock).not.toHaveBeenCalled();
  });

  it('JSON body sent in the OLD fileUrl-only shape (no bucket/path at all — a stale pre-deploy client): 400 MISSING_BUCKET, zero storage calls', async () => {
    const { POST } = await import('./route');

    const res = await POST(jsonRequest({ fileUrl: 'https://example.test/storage/v1/object/public/pdfs/x.pdf', fileName: 'Project_Damodar.pdf', fileType: 'application/pdf', fileSize: 975694 }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.code).toBe('MISSING_BUCKET');
    expect(downloadFromStorageMock).not.toHaveBeenCalled();
  });

  it('JSON body missing "bucket": 400 MISSING_BUCKET, zero storage calls', async () => {
    const { POST } = await import('./route');
    const res = await POST(jsonRequest({ path: 'diagnostic_test_dealcollab_ai/x.pdf', fileName: 'x.pdf' }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.code).toBe('MISSING_BUCKET');
    expect(downloadFromStorageMock).not.toHaveBeenCalled();
  });

  it('JSON body missing "fileName": 400 MISSING_FILE_NAME, zero storage calls', async () => {
    const { POST } = await import('./route');
    const res = await POST(jsonRequest({ bucket: 'pdfs', path: 'diagnostic_test_dealcollab_ai/x.pdf' }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.code).toBe('MISSING_FILE_NAME');
    expect(downloadFromStorageMock).not.toHaveBeenCalled();
  });

  it('wrong bucket name: 400 "Invalid storage bucket", zero storage calls', async () => {
    const { POST } = await import('./route');
    const res = await POST(jsonRequest({ bucket: 'avatars', path: 'diagnostic_test_dealcollab_ai/x.pdf', fileName: 'x.pdf' }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toMatch(/Invalid storage bucket/);
    expect(downloadFromStorageMock).not.toHaveBeenCalled();
  });

  it('path belonging to a different user\'s prefix: 403, zero storage calls (IDOR guard)', async () => {
    const { POST } = await import('./route');
    const res = await POST(jsonRequest({ bucket: 'pdfs', path: 'someone_else_example_com/x.pdf', fileName: 'x.pdf' }));
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toMatch(/do not have access/);
    expect(downloadFromStorageMock).not.toHaveBeenCalled();
  });

  it('valid bucket/path/fileName for the authenticated user: passes validation and DOES reach the storage download (proves the happy path is not blocked by the same checks); a persistent FILE_NOT_FOUND retries twice (bounded) then gives up as 404', async () => {
    vi.useFakeTimers();
    downloadFromStorageMock.mockResolvedValue({
      success: false,
      code: 'STORAGE_OBJECT_NOT_FOUND',
      status: 404,
      message: 'Document not found in storage: not found',
    });
    const { POST } = await import('./route');

    const resPromise = POST(jsonRequest({ bucket: 'pdfs', path: 'diagnostic_test_dealcollab_ai/x.pdf', fileName: 'x.pdf', fileType: 'application/pdf', fileSize: 100 }));
    await vi.advanceTimersByTimeAsync(1000); // past both retry delays (250ms + 500ms)
    const res = await resPromise;

    expect(downloadFromStorageMock).toHaveBeenCalledTimes(3); // initial attempt + 2 bounded retries
    expect(downloadFromStorageMock).toHaveBeenCalledWith(expect.anything(), 'pdfs', 'diagnostic_test_dealcollab_ai/x.pdf');
    expect(res.status).toBe(404);
    vi.useRealTimers();
  });

  it('FILE_NOT_FOUND that resolves on the second attempt (eventual-consistency race just after upload) succeeds without surfacing an error', async () => {
    vi.useFakeTimers();
    downloadFromStorageMock
      .mockResolvedValueOnce({ success: false, code: 'STORAGE_OBJECT_NOT_FOUND', status: 404, message: 'not found yet' })
      .mockResolvedValueOnce({ success: true, buffer: Buffer.from('%PDF-1.4 minimal'), contentType: 'application/pdf' });
    const { extractTextFromFile } = await import('@/lib/documentParser');
    vi.mocked(extractTextFromFile).mockResolvedValue({ text: 'hello world extracted text', pageCount: 1, extractionMethod: 'native', pagesProcessed: 1, warnings: [] });
    const { POST } = await import('./route');

    const resPromise = POST(jsonRequest({ bucket: 'pdfs', path: 'diagnostic_test_dealcollab_ai/x.pdf', fileName: 'x.pdf', fileType: 'application/pdf', fileSize: 100 }));
    await vi.advanceTimersByTimeAsync(1000);
    const res = await resPromise;

    expect(downloadFromStorageMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    vi.useRealTimers();
  });

  it('STORAGE_DOWNLOAD_FAILED (a genuine, non-transient storage error) is NOT retried — only FILE_NOT_FOUND gets the bounded retry', async () => {
    downloadFromStorageMock.mockResolvedValue({
      success: false,
      code: 'STORAGE_DOWNLOAD_FAILED',
      status: 502,
      message: 'connection reset',
    });
    const { POST } = await import('./route');

    const res = await POST(jsonRequest({ bucket: 'pdfs', path: 'diagnostic_test_dealcollab_ai/x.pdf', fileName: 'x.pdf', fileType: 'application/pdf', fileSize: 100 }));

    expect(downloadFromStorageMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
  });

  it('path containing ".." is rejected as 400 INVALID_PATH before any storage call (defense-in-depth against path traversal)', async () => {
    const { POST } = await import('./route');
    const res = await POST(jsonRequest({ bucket: 'pdfs', path: 'diagnostic_test_dealcollab_ai/../someone_else/x.pdf', fileName: 'x.pdf' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.code).toBe('INVALID_PATH');
    expect(downloadFromStorageMock).not.toHaveBeenCalled();
  });

  it('downloaded bytes exceeding the size cap are rejected as 413 FILE_TOO_LARGE, derived from the real buffer length (not the client-supplied fileSize)', async () => {
    const oversized = Buffer.alloc(11 * 1024 * 1024, 0x41); // 11MB > 10MB cap
    downloadFromStorageMock.mockResolvedValue({ success: true, buffer: oversized, contentType: 'application/pdf' });
    const { POST } = await import('./route');

    const res = await POST(jsonRequest({ bucket: 'pdfs', path: 'diagnostic_test_dealcollab_ai/x.pdf', fileName: 'x.pdf', fileType: 'application/pdf', fileSize: 100 }));
    const data = await res.json();

    expect(res.status).toBe(413);
    expect(data.code).toBe('FILE_TOO_LARGE');
  });

  it('an unsupported declared MIME type is rejected as 415 UNSUPPORTED_FILE_TYPE (not 400, not IMAGE_BASED_PDF)', async () => {
    downloadFromStorageMock.mockResolvedValue({ success: true, buffer: Buffer.from('PK\x03\x04 zip-like bytes'), contentType: 'application/zip' });
    const { POST } = await import('./route');

    const res = await POST(jsonRequest({ bucket: 'pdfs', path: 'diagnostic_test_dealcollab_ai/x.zip', fileName: 'x.zip', fileType: 'application/zip', fileSize: 100 }));
    const data = await res.json();

    expect(res.status).toBe(415);
    expect(data.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('CRITICAL: a genuine, valid PDF whose client-declared MIME type is wrong (e.g. "image/png") is rejected as 422 FILE_CONTENT_TYPE_MISMATCH — NEVER as IMAGE_BASED_PDF, since a MIME/byte mismatch is not evidence the document is scanned. Uses the REAL checkFileSignature implementation, not the mock.', async () => {
    const { checkFileSignature: realCheckFileSignature } = await vi.importActual<typeof import('../../../../lib/fileSignature')>('../../../../lib/fileSignature');
    const fileSignatureModule = await import('@/lib/fileSignature');
    vi.mocked(fileSignatureModule.checkFileSignature).mockImplementation(realCheckFileSignature);

    try {
      const realPdfBytes = Buffer.from('%PDF-1.4\n%%EOF');
      downloadFromStorageMock.mockResolvedValue({ success: true, buffer: realPdfBytes, contentType: 'application/pdf' });
      const { POST } = await import('./route');

      const res = await POST(jsonRequest({ bucket: 'pdfs', path: 'diagnostic_test_dealcollab_ai/x.png', fileName: 'x.png', fileType: 'image/png', fileSize: realPdfBytes.length }));
      const data = await res.json();

      // image/png IS a SUPPORTED_TYPES entry, so this reaches byte-validation,
      // where the real signature check rejects real PDF bytes against a
      // declared image/png type.
      expect(res.status).toBe(422);
      expect(data.code).toBe('FILE_CONTENT_TYPE_MISMATCH');
      expect(data.code).not.toBe('IMAGE_BASED_PDF');
    } finally {
      // vi.clearAllMocks() (beforeEach) clears call history but NOT a
      // mockImplementation override — restore the always-valid stub
      // explicitly so later tests aren't unexpectedly subjected to the real
      // signature check.
      vi.mocked(fileSignatureModule.checkFileSignature).mockImplementation(() => ({ valid: true }));
    }
  });

  it('CRITICAL: a storage/network download failure is NEVER classified as IMAGE_BASED_PDF', async () => {
    downloadFromStorageMock.mockResolvedValue({ success: false, code: 'STORAGE_DOWNLOAD_FAILED', status: 502, message: 'connection reset' });
    const { POST } = await import('./route');

    const res = await POST(jsonRequest({ bucket: 'pdfs', path: 'diagnostic_test_dealcollab_ai/x.pdf', fileName: 'x.pdf', fileType: 'application/pdf', fileSize: 100 }));
    const data = await res.json();

    expect(data.code).not.toBe('IMAGE_BASED_PDF');
    expect(data.code).toBe('STORAGE_DOWNLOAD_FAILED');
  });

  it('CRITICAL: a malformed request (missing required fields) always returns a machine-readable error code', async () => {
    const { POST } = await import('./route');
    const res = await POST(jsonRequest({ bucket: 'pdfs' }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(typeof data.code).toBe('string');
    expect(data.code.length).toBeGreaterThan(0);
  });

  it('multipart request with no "file" field: 400, zero storage calls', async () => {
    const { POST } = await import('./route');
    const form = new FormData();
    form.set('notFile', 'irrelevant');
    const req = new NextRequest('http://localhost/api/chat/parse-document', { method: 'POST', body: form });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/No file provided/);
    expect(downloadFromStorageMock).not.toHaveBeenCalled();
  });

  it('empty/malformed request body with JSON content-type: 400 "Invalid JSON in request body" — not a 500, and zero external calls (previously uncaught, fell through to the generic 500 classifier)', async () => {
    const { POST } = await import('./route');
    const req = new NextRequest('http://localhost/api/chat/parse-document', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '',
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/Invalid JSON/);
    expect(downloadFromStorageMock).not.toHaveBeenCalled();
  });

  it('an empty downloaded object is rejected as 422 CORRUPTED_FILE, not passed to the parser', async () => {
    downloadFromStorageMock.mockResolvedValue({ success: false, code: 'CORRUPTED_FILE', status: 422, message: 'Downloaded file is empty' });
    const { extractTextFromFile } = await import('@/lib/documentParser');
    const { POST } = await import('./route');

    const res = await POST(jsonRequest({ bucket: 'pdfs', path: 'diagnostic_test_dealcollab_ai/x.pdf', fileName: 'x.pdf', fileType: 'application/pdf', fileSize: 0 }));
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.code).toBe('CORRUPTED_FILE');
    expect(extractTextFromFile).not.toHaveBeenCalled();
  });

  it('a valid DOCX upload is extracted and returned successfully end-to-end through the route', async () => {
    downloadFromStorageMock.mockResolvedValue({ success: true, buffer: Buffer.from('PK\x03\x04 fake docx zip'), contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const { extractTextFromFile } = await import('@/lib/documentParser');
    vi.mocked(extractTextFromFile).mockResolvedValue({ text: 'Company XYZ is seeking acquisition.', pageCount: null, extractionMethod: 'native', pagesProcessed: 1, warnings: [] });
    const { POST } = await import('./route');

    const res = await POST(jsonRequest({
      bucket: 'pdfs',
      path: 'diagnostic_test_dealcollab_ai/x.docx',
      fileName: 'x.docx',
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: 100,
    }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.text).toContain('Company XYZ');
  });

  it('a valid TXT upload is extracted and returned successfully end-to-end through the route', async () => {
    downloadFromStorageMock.mockResolvedValue({ success: true, buffer: Buffer.from('Deal mandate: sell-side, SaaS, Bangalore.'), contentType: 'text/plain' });
    const { extractTextFromFile } = await import('@/lib/documentParser');
    vi.mocked(extractTextFromFile).mockResolvedValue({ text: 'Deal mandate: sell-side, SaaS, Bangalore.', pageCount: null, extractionMethod: 'native', pagesProcessed: 1, warnings: [] });
    const { POST } = await import('./route');

    const res = await POST(jsonRequest({
      bucket: 'pdfs',
      path: 'diagnostic_test_dealcollab_ai/x.txt',
      fileName: 'x.txt',
      fileType: 'text/plain',
      fileSize: 100,
    }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.text).toContain('Deal mandate');
  });
});
