import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateOtp } from '@/lib/otp';
import { sendWhatsAppOTP } from '@/lib/whatsapp/provider';
import { WhatsAppProvider } from '@/lib/whatsapp/types';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export async function POST(req: Request) {
  try {
    const { phone } = await req.json();

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Cap OTP issuance per phone AND per IP — without this, an attacker can
    // spam-bomb any phone number with WhatsApp messages or drive up send costs.
    const perPhone = checkRateLimit(`otp-send:phone:${phone}`, 3, 10 * 60 * 1000);
    const perIp = checkRateLimit(`otp-send:ip:${getClientIp(req)}`, 10, 10 * 60 * 1000);
    if (!perPhone.allowed || !perIp.allowed) {
      return NextResponse.json({ error: 'Too many requests — please wait before requesting another code' }, { status: 429 });
    }

    const otp = generateOtp();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const user = await db.query.users.findFirst({
      where: eq(users.phone, phone),
    });

    if (user) {
      await db.update(users)
        .set({ otpCode: otp, otpExpires: expires, otpAttempts: 0 })
        .where(eq(users.id, user.id));
    } else {
      await db.insert(users).values({
        email: `${phone.replace(/\D/g, '')}@dealcollab.ai`,
        phone: phone,
        otpCode: otp,
        otpExpires: expires,
        otpAttempts: 0,
        source: 'whatsapp',
      });
    }

    // Determine provider from user source, or default to meta
    const provider: WhatsAppProvider = user?.source === 'whatsapp-wappbiz' ? 'wappbiz' : 'meta';

    const res = await sendWhatsAppOTP(provider, phone, otp);

    if (!res.success) {
      return NextResponse.json({ error: 'Failed to send WhatsApp OTP', details: res.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('WhatsApp OTP Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
