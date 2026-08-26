import { describe, it, expect } from 'vitest';
import { isAllowedFileUrl } from '../ssrfGuard';

const SUPABASE_URL = 'https://qnxeyhdtrjdlqtjgwmnx.supabase.co';

/**
 * Regression tests for the SSRF fix in /api/chat/parse-document (2026-08-26).
 * Previously `fetch(fileUrl)` ran on a fully client-controlled URL with no
 * validation — an authenticated user could target internal/metadata
 * endpoints and have the server fetch and return the content.
 */
describe('isAllowedFileUrl', () => {
  it('allows the real Supabase storage URL', () => {
    expect(isAllowedFileUrl(`${SUPABASE_URL}/storage/v1/object/public/pdfs/some-file.pdf`, SUPABASE_URL)).toBe(true);
  });

  it('blocks the AWS/GCP cloud metadata endpoint', () => {
    expect(isAllowedFileUrl('http://169.254.169.254/latest/meta-data/iam/security-credentials/', SUPABASE_URL)).toBe(false);
  });

  it('blocks localhost / internal loopback', () => {
    expect(isAllowedFileUrl('http://localhost:3000/api/admin/dashboard', SUPABASE_URL)).toBe(false);
    expect(isAllowedFileUrl('http://127.0.0.1:5432/', SUPABASE_URL)).toBe(false);
  });

  it('blocks a different, attacker-controlled https host', () => {
    expect(isAllowedFileUrl('https://attacker.example.com/steal', SUPABASE_URL)).toBe(false);
  });

  it('blocks a plain http scheme even for the right host (require https)', () => {
    expect(isAllowedFileUrl(`http://qnxeyhdtrjdlqtjgwmnx.supabase.co/storage/v1/object/public/pdfs/x.pdf`, SUPABASE_URL)).toBe(false);
  });

  it('blocks a lookalike subdomain trying to pass a substring check', () => {
    expect(isAllowedFileUrl('https://qnxeyhdtrjdlqtjgwmnx.supabase.co.attacker.com/x.pdf', SUPABASE_URL)).toBe(false);
  });

  it('rejects malformed URLs safely instead of throwing', () => {
    expect(isAllowedFileUrl('not a url', SUPABASE_URL)).toBe(false);
  });

  it('fails closed when the Supabase URL env var is missing', () => {
    expect(isAllowedFileUrl(`${SUPABASE_URL}/storage/v1/object/public/pdfs/x.pdf`, undefined)).toBe(false);
  });
});
