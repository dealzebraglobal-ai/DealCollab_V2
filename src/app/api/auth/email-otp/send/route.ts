import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isValidEmail } from '@/lib/validation/profile';
import { generateOtp, hashOtp, sendOtpEmail } from '@/lib/emailOtp';

export const dynamic = "force-dynamic";

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    let user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (user?.otpExpires) {
      const issuedAt = user.otpExpires.getTime() - OTP_TTL_MS;
      if (Date.now() - issuedAt < RESEND_COOLDOWN_MS) {
        return NextResponse.json({ error: 'Please wait before requesting another code' }, { status: 429 });
      }
    }

    const code = generateOtp();
    const otpExpires = new Date(Date.now() + OTP_TTL_MS);
    console.log('[email-otp/send] OTP generated', { email: normalizedEmail });

    if (!user) {
      const [newUser] = await db.insert(users).values({
        email: normalizedEmail,
        otpCode: hashOtp(code),
        otpExpires,
        otpAttempts: 0,
        source: 'web',
      }).returning();
      user = newUser;
    } else {
      await db.update(users)
        .set({ otpCode: hashOtp(code), otpExpires, otpAttempts: 0 })
        .where(eq(users.id, user.id));
    }
    console.log('[email-otp/send] OTP saved to DB', { userId: user.id });

    // sendOtpEmail throws with a specific reason on any failure (missing
    // config, no Brevo credits, non-2xx response, missing messageId) — we
    // deliberately do NOT catch it here so a failed send never reports
    // success to the client.
    await sendOtpEmail(normalizedEmail, code);
    console.log('[email-otp/send] Email sent successfully', { email: normalizedEmail });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[email-otp/send] error:', error);
    const message = error instanceof Error ? error.message : 'Failed to send verification code';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
