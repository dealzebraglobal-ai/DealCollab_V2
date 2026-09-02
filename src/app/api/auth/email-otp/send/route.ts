import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isValidEmail } from '@/lib/validation/profile';
import { generateOtp, hashOtp, sendOtpEmail } from '@/lib/emailOtp';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { describeAuthError as describeDbError } from '@/lib/authDiagnostics';

export const dynamic = "force-dynamic";

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

/** Structured stage breadcrumb — never logs OTP values, secrets, or full emails. */
function otpLog(stage: string, result: 'START' | 'SUCCESS' | 'FAILED', extra: Record<string, unknown> = {}) {
  try {
    console.log(`[email-otp/send ${stage} ${result}]`, JSON.stringify(extra));
  } catch {
    console.log(`[email-otp/send ${stage} ${result}]`);
  }
}

export async function POST(req: Request) {
  // --- parse body (a malformed body is a client error, not a 500) ----------
  let email: unknown;
  try {
    ({ email } = await req.json());
  } catch {
    otpLog('OTP_REQUEST_RECEIVED', 'FAILED', { reason: 'body_not_json' });
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }

  otpLog('OTP_REQUEST_RECEIVED', 'START', {
    email: typeof email === 'string' ? email.replace(/(?<=^.{2}).*(?=@)/, '***') : 'invalid',
  });

  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    otpLog('EMAIL_VALIDATED', 'FAILED');
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }
  otpLog('EMAIL_VALIDATED', 'SUCCESS');

  // Per-IP cap in addition to the per-email resend cooldown below.
  const perIp = checkRateLimit(`email-otp-send:ip:${getClientIp(req)}`, 10, 10 * 60 * 1000);
  if (!perIp.allowed) {
    return NextResponse.json({ error: 'Too many requests — please wait before requesting another code' }, { status: 429 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // --- DB stage: isolated so a schema/connection fault is reported with its
  //     Postgres code/column and never leaked verbatim to the client --------
  let userId: string;
  try {
    otpLog('OTP_DATABASE_LOOKUP', 'START');
    // Select ONLY the columns this route reads — keeps OTP delivery working
    // even if some unrelated `users` column in schema.ts is ahead of the
    // deployed DB (the relational default is SELECT <all schema columns>).
    const existing = await db.query.users.findFirst({
      columns: { id: true, otpExpires: true },
      where: eq(users.email, normalizedEmail),
    });
    otpLog('OTP_DATABASE_LOOKUP', 'SUCCESS', { userExists: !!existing });

    if (existing?.otpExpires) {
      const issuedAt = existing.otpExpires.getTime() - OTP_TTL_MS;
      if (Date.now() - issuedAt < RESEND_COOLDOWN_MS) {
        return NextResponse.json({ error: 'Please wait before requesting another code' }, { status: 429 });
      }
    }

    const code = generateOtp();
    const otpExpires = new Date(Date.now() + OTP_TTL_MS);
    otpLog('OTP_GENERATED', 'SUCCESS');

    otpLog('OTP_DATABASE_WRITE', 'START', { mode: existing ? 'update' : 'insert' });
    if (!existing) {
      const [newUser] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          otpCode: hashOtp(code),
          otpExpires,
          otpAttempts: 0,
          source: 'web',
        })
        .returning({ id: users.id });
      userId = newUser.id;
    } else {
      await db.update(users)
        .set({ otpCode: hashOtp(code), otpExpires, otpAttempts: 0 })
        .where(eq(users.id, existing.id));
      userId = existing.id;
    }
    otpLog('OTP_DATABASE_WRITE', 'SUCCESS', { userId });

    // --- email stage ------------------------------------------------------
    // sendOtpEmail throws a user-safe Error on any failure (missing config,
    // no credits, non-2xx, missing messageId). Its message is safe to return;
    // it is NOT caught here so a failed send never reports success.
    otpLog('EMAIL_SEND_STARTED', 'START');
    await sendOtpEmail(normalizedEmail, code);
    otpLog('EMAIL_SEND_COMPLETED', 'SUCCESS');

    otpLog('OTP_REQUEST_COMPLETED', 'SUCCESS', { userId });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const info = describeDbError(error);
    const isDbError = !!info.code || /pg|postgres|column|relation|violates|syntax/i.test(info.message);

    if (isDbError) {
      otpLog('OTP_DATABASE_WRITE', 'FAILED', { ...info });
      // Do NOT echo the Postgres message (it can name internal columns) —
      // the detail is in the server log above.
      return NextResponse.json({ error: 'Failed to send verification code' }, { status: 500 });
    }

    // Non-DB failure — e.g. sendOtpEmail's deliberately user-safe messages.
    otpLog('OTP_REQUEST_FAILED', 'FAILED', { errorClass: info.errorClass, message: info.message });
    const message = error instanceof Error ? error.message : 'Failed to send verification code';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
