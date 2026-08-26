/**
 * DealCollab — safe fetch-response JSON parsing
 * ================================================
 * Every API route in this app returns JSON on every code path (validated),
 * but a client-side fetch can still receive an HTML document instead — a
 * Vercel platform-level error page (function crash/timeout), a CDN/edge
 * cache serving a stale response, or a browser extension interfering with
 * the request. Blindly calling `res.json()` on that turns into the
 * confusing `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
 * crash seen in production, with nothing sanitized in the console.
 *
 * Used at every fetch call site that talks to a same-origin API route (see
 * EmailVerification.tsx, EmailOtpVerification.tsx).
 */
export async function parseJsonResponse<T = Record<string, unknown>>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }

  const text = await res.text();
  console.error('[fetchJson] Non-JSON response from API', { status: res.status, url: res.url, body: text.slice(0, 200) });
  throw new Error('Something went wrong. Please try again.');
}
