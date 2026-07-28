import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { validateOtp } from '@/lib/otp';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { phone, code } = await req.json();

    // Independent of the per-user otpAttempts counter (which only increments
    // once a user row exists) — this stops brute-forcing across many phone
    // numbers from a single source.
    const perIp = checkRateLimit(`otp-verify:ip:${getClientIp(req)}`, 20, 10 * 60 * 1000);
    if (!perIp.allowed) {
      return NextResponse.json({ error: 'Too many attempts — please wait before trying again' }, { status: 429 });
    }

    if (!code || typeof code !== 'string' || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.phone, phone),
    });

    // A code must have actually been issued (via /api/auth/whatsapp-otp) for this
    // phone. Previously this fell back to accepting ANY 6-digit code when no OTP
    // was on file, which let anyone claim an existing verified phone number and
    // sign in as that user (the Credentials provider trusts isPhoneVerified with
    // no further check). There is no safe mock path — verification must always
    // check a real, issued code.
    const result = validateOtp({
      submittedCode: code,
      storedCode: user?.otpCode,
      storedExpires: user?.otpExpires,
      attemptsSoFar: user?.otpAttempts,
    });

    if (!result.valid) {
      if (user) {
        await db.update(users)
          .set({ otpAttempts: (user.otpAttempts ?? 0) + 1 })
          .where(eq(users.id, user.id));
      }

      const messages: Record<typeof result.reason, string> = {
        not_issued: 'No verification code was issued for this number — request a new one',
        expired: 'This code has expired — request a new one',
        too_many_attempts: 'Too many incorrect attempts — request a new code',
        incorrect: 'Incorrect verification code',
      };
      return NextResponse.json({ error: messages[result.reason] }, { status: 400 });
    }

    await db.update(users)
      .set({ isPhoneVerified: true, otpCode: null, otpExpires: null, otpAttempts: 0 })
      .where(eq(users.id, user!.id));

    return NextResponse.json({ success: true, phone: user!.phone });
  } catch (error: unknown) {
    console.error("FULL ERROR:", error);
    console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
    const errorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
    return NextResponse.json({ error: errorMessage || 'Verification failed' }, { status: 500 });
  }
}
