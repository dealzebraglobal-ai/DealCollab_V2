import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { hashOtp } from '@/lib/emailOtp';

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Enter the 6-digit code' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log('[email-otp/verify] OTP received', { email: normalizedEmail });

    const user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (!user || !user.otpCode || !user.otpExpires) {
      console.warn('[email-otp/verify] No stored OTP found', { email: normalizedEmail });
      return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
    }
    console.log('[email-otp/verify] Stored OTP found', { userId: user.id });

    if (user.otpExpires.getTime() < Date.now()) {
      console.warn('[email-otp/verify] OTP expired', { userId: user.id });
      return NextResponse.json({ error: 'Code has expired. Please request a new one.' }, { status: 400 });
    }

    if ((user.otpAttempts ?? 0) >= MAX_ATTEMPTS) {
      console.warn('[email-otp/verify] Too many attempts', { userId: user.id });
      return NextResponse.json({ error: 'Too many attempts. Please request a new code.' }, { status: 429 });
    }

    if (hashOtp(code) !== user.otpCode) {
      await db.update(users)
        .set({ otpAttempts: (user.otpAttempts ?? 0) + 1 })
        .where(eq(users.id, user.id));
      console.warn('[email-otp/verify] Incorrect code', { userId: user.id });
      return NextResponse.json({ error: 'Incorrect code' }, { status: 400 });
    }

    console.log('[email-otp/verify] OTP matched', { userId: user.id });

    await db.update(users)
      .set({ otpCode: null, otpExpires: null, otpAttempts: 0, emailVerified: new Date() })
      .where(eq(users.id, user.id));

    return NextResponse.json({ success: true, email: normalizedEmail, hasPhone: !!user.phone });
  } catch (error: unknown) {
    console.error('[email-otp/verify] error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
