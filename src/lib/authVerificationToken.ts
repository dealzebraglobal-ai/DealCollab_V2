import crypto from 'crypto';

/**
 * DealCollab — Auth Verification Tokens
 * =====================================
 * Short-lived, HMAC-signed verification tokens proving that a user
 * successfully verified an OTP for a specific email or phone number.
 *
 * This prevents the critical authentication bypass where a client
 * could directly call Auth.js credentials endpoints with an arbitrary
 * email/phone without proving they possess the verified OTP code.
 */

const VERIFICATION_TTL_SECONDS = 120; // 2 minutes

function getAuthSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET (or AUTH_SECRET) is not configured.');
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export interface AuthVerificationPayload {
  type: 'email' | 'phone';
  value: string;
  userId?: string;
  purpose: 'otp-verified';
  iat: number;
  exp: number;
}

export function createAuthVerificationToken(params: {
  type: 'email' | 'phone';
  value: string;
  userId?: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const normalizedValue = params.type === 'email' ? params.value.trim().toLowerCase() : params.value.trim();

  const payload: AuthVerificationPayload = {
    type: params.type,
    value: normalizedValue,
    userId: params.userId,
    purpose: 'otp-verified',
    iat: now,
    exp: now + VERIFICATION_TTL_SECONDS,
  };

  const header = { alg: 'HS256', typ: 'DCAV' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getAuthSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export type TokenVerificationResult =
  | { valid: true; payload: AuthVerificationPayload }
  | { valid: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'type_mismatch' | 'value_mismatch' };

export function verifyAuthVerificationToken(
  token: string,
  expectedType: 'email' | 'phone',
  expectedValue: string
): TokenVerificationResult {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'malformed' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'malformed' };
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  let expectedSignature: string;
  try {
    expectedSignature = crypto
      .createHmac('sha256', getAuthSecret())
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');
  } catch {
    return { valid: false, reason: 'bad_signature' };
  }

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'bad_signature' };
  }

  let payload: AuthVerificationPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  if (payload.purpose !== 'otp-verified') {
    return { valid: false, reason: 'malformed' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    return { valid: false, reason: 'expired' };
  }

  if (payload.type !== expectedType) {
    return { valid: false, reason: 'type_mismatch' };
  }

  const normalizedExpected = expectedType === 'email' ? expectedValue.trim().toLowerCase() : expectedValue.trim();
  if (payload.value !== normalizedExpected) {
    return { valid: false, reason: 'value_mismatch' };
  }

  return { valid: true, payload };
}
