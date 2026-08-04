/**
 * DealCollab — minimal in-memory rate limiter
 * =============================================
 * There is no rate-limiting library or shared store (Redis/Upstash) anywhere
 * in this codebase, and the app runs as a single Vercel Node.js function
 * (not edge, not multi-region) — so a per-process in-memory sliding window is
 * sufficient to stop casual abuse (OTP spam, chat flooding) without adding a
 * new infra dependency. It resets on redeploy/cold-start; that's an accepted
 * tradeoff for the current scale (see security report for the Redis upgrade
 * path if traffic grows).
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

// Prevent unbounded memory growth from an endless stream of distinct keys
// (e.g. an attacker rotating IPs) — evict the oldest entries once we cross
// this size rather than growing forever.
const MAX_BUCKETS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * @param key Unique identifier for the caller — e.g. `otp:${phone}` or `chat:${userId}`.
 * @param limit Max requests allowed per window.
 * @param windowMs Window size in milliseconds.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    if (buckets.size >= MAX_BUCKETS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
    }
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: windowMs - (now - existing.windowStart) };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterMs: 0 };
}

/** Best-effort caller identifier when no authenticated user/phone is available yet. */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}
