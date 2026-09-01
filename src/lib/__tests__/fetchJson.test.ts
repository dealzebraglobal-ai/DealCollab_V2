import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseJsonResponse } from '../fetchJson';

/**
 * Regression test for the production "Unexpected token '<', <!DOCTYPE"
 * crash — the email-otp send/verify/resend fetch call sites previously
 * called res.json() unconditionally, so any HTML response (a Vercel
 * platform error page, a stale cache, etc.) crashed with that exact raw
 * JSON.parse error string instead of a clean, user-facing message.
 */
describe('parseJsonResponse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses a real JSON response normally', async () => {
    const res = new Response(JSON.stringify({ success: true }), {
      headers: { 'content-type': 'application/json' },
    });
    await expect(parseJsonResponse<{ success: boolean }>(res)).resolves.toEqual({ success: true });
  });

  it('throws a clean, user-facing error instead of a JSON.parse crash when the body is HTML', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = new Response('<!DOCTYPE html><html><body>Internal Server Error</body></html>', {
      status: 500,
      headers: { 'content-type': 'text/html' },
    });

    await expect(parseJsonResponse(res)).rejects.toThrow('Something went wrong. Please try again.');
  });

  it('never lets the raw HTML body reach the caller as the thrown error message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = new Response('<!DOCTYPE html>...', { headers: { 'content-type': 'text/html' } });

    try {
      await parseJsonResponse(res);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).not.toContain('<!DOCTYPE');
    }
  });
});
