import { describe, it, expect } from 'vitest';
import { downloadFromStorage } from '../storageDownload';

/**
 * Regression tests for the server-authenticated Supabase Storage download
 * that replaced fetching a client-constructed public URL in
 * /api/chat/parse-document. These prove the three failure classes (missing
 * object, storage/network failure, empty content) are each classified
 * distinctly — none of them should ever be reported to the user as
 * IMAGE_BASED_PDF, since none of them are evidence the document is scanned.
 */

function fakeSupabase(download: (path: string) => Promise<{ data: Blob | null; error: { message?: string; status?: number } | null }>) {
  return { storage: { from: () => ({ download }) } };
}

describe('downloadFromStorage', () => {
  it('returns the buffer and content type on success', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4 fake pdf content');
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const supabase = fakeSupabase(async () => ({ data: blob, error: null }));

    const result = await downloadFromStorage(supabase, 'pdfs', 'user_x/123.pdf');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.buffer.length).toBe(bytes.length);
      expect(result.contentType).toBe('application/pdf');
      expect(result.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
  });

  it('classifies a "not found" storage error as FILE_NOT_FOUND (404), not a generic failure', async () => {
    const supabase = fakeSupabase(async () => ({ data: null, error: { message: 'Object not found' } }));
    const result = await downloadFromStorage(supabase, 'pdfs', 'user_x/missing.pdf');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('FILE_NOT_FOUND');
      expect(result.status).toBe(404);
    }
  });

  it('classifies any other storage error as STORAGE_DOWNLOAD_FAILED (502) — an upstream problem, not the user\'s file', async () => {
    const supabase = fakeSupabase(async () => ({ data: null, error: { message: 'connection reset' } }));
    const result = await downloadFromStorage(supabase, 'pdfs', 'user_x/file.pdf');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('STORAGE_DOWNLOAD_FAILED');
      expect(result.status).toBe(502);
    }
  });

  it('classifies a successful-but-empty download as INVALID_FILE_CONTENT (422), never as a successful parse', async () => {
    const blob = new Blob([], { type: 'application/pdf' });
    const supabase = fakeSupabase(async () => ({ data: blob, error: null }));
    const result = await downloadFromStorage(supabase, 'pdfs', 'user_x/empty.pdf');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_FILE_CONTENT');
      expect(result.status).toBe(422);
    }
  });

  it('classifies a null data response (no error, no blob) as STORAGE_DOWNLOAD_FAILED rather than crashing', async () => {
    const supabase = fakeSupabase(async () => ({ data: null, error: null }));
    const result = await downloadFromStorage(supabase, 'pdfs', 'user_x/weird.pdf');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('STORAGE_DOWNLOAD_FAILED');
    }
  });
});
