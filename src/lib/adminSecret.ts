import crypto from 'crypto';

/**
 * Timing-safe comparison for the internal x-admin-secret header (used to let
 * trusted server-to-server callers — e.g. the WhatsApp adapter — act on
 * behalf of a userId without a browser session). Extracted from
 * src/app/api/chat/route.ts so every route checking this header uses the
 * same constant-time compare instead of each reimplementing (or, as found
 * in src/app/api/deals/bulk-upload/route.ts, using a plain `===`, which is
 * vulnerable to a timing side-channel).
 */
export function isValidAdminSecret(header: string | null): boolean {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || !header) return false;

  const expectedBuf = Buffer.from(expected);
  const headerBuf = Buffer.from(header);
  if (expectedBuf.length !== headerBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, headerBuf);
}
