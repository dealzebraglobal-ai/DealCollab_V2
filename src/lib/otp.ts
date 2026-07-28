import crypto from 'crypto';

/**
 * DealCollab — OTP generation + validation
 * ==========================================
 * Uses the users table's existing (previously unused) otpCode / otpExpires /
 * otpAttempts columns — no new OTP table. src/app/api/auth/otp/verify/route.ts
 * requires a real code to have been issued (via /api/auth/whatsapp-otp) before
 * it will verify — there is no mock/bypass path.
 */

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

export function generateOtp(): string {
  // crypto.randomInt is rejection-sampled — uniform, unlike `% 10`.
  let code = '';
  for (let i = 0; i < OTP_LENGTH; i++) code += crypto.randomInt(0, 10).toString();
  return code;
}

export function otpExpiryDate(): Date {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
}

export type OtpValidationResult =
  | { valid: true }
  | { valid: false; reason: 'not_issued' | 'expired' | 'too_many_attempts' | 'incorrect' };

/** Pure comparison — callers own the DB read/write (increment attempts, clear on success, etc.). */
export function validateOtp(params: {
  submittedCode: string;
  storedCode: string | null | undefined;
  storedExpires: Date | string | null | undefined;
  attemptsSoFar: number | null | undefined;
}): OtpValidationResult {
  const { submittedCode, storedCode, storedExpires, attemptsSoFar } = params;

  if (!storedCode || !storedExpires) return { valid: false, reason: 'not_issued' };
  if ((attemptsSoFar ?? 0) >= MAX_OTP_ATTEMPTS) return { valid: false, reason: 'too_many_attempts' };
  if (new Date(storedExpires).getTime() < Date.now()) return { valid: false, reason: 'expired' };
  if (submittedCode !== storedCode) return { valid: false, reason: 'incorrect' };

  return { valid: true };
}
