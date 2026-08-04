import crypto from 'crypto';

/**
 * DealCollab — Magic Link tokens
 * ================================
 * Short-lived, HMAC-signed (HS256-equivalent) tokens for the WhatsApp →
 * web handoff. Deliberately dependency-free (no jsonwebtoken/jose add) —
 * this is a minimal JWT-shaped token (base64url header.payload.signature)
 * signed with the same secret NextAuth already uses (NEXTAUTH_SECRET /
 * AUTH_SECRET), so no new secret to provision.
 */

const DEFAULT_TTL_SECONDS = 15 * 60; // 15 minutes

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET (or AUTH_SECRET) is not configured — cannot sign magic links.');
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export interface MagicLinkPayload {
  userId: string;
  phone: string;
  purpose: 'whatsapp-magic-link';
  iat: number;
  exp: number;
}

export function createMagicLinkToken(userId: string, phone: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const header = { alg: 'HS256', typ: 'DCML' }; // DealCollab Magic Link — distinct typ, not a real JWT lib output
  const now = Math.floor(Date.now() / 1000);
  const payload: MagicLinkPayload = { userId, phone, purpose: 'whatsapp-magic-link', iat: now, exp: now + ttlSeconds };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export type MagicLinkVerification =
  | { valid: true; payload: MagicLinkPayload }
  | { valid: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyMagicLinkToken(token: string): MagicLinkVerification {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  const [encodedHeader, encodedPayload, signature] = parts;

  const expectedSignature = crypto
    .createHmac('sha256', getSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  // Constant-time compare — signatures are equal length base64url strings.
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: 'bad_signature' };
  }

  let payload: MagicLinkPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: 'expired' };
  }

  return { valid: true, payload };
}
