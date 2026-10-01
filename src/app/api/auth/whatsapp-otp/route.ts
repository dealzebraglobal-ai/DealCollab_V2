import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateOtp } from '@/lib/otp';
import { sendWhatsAppOTP } from '@/lib/whatsapp/provider';
import { WhatsAppProvider } from '@/lib/whatsapp/types';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { hashOtp } from '@/lib/emailOtp';

export async function POST(req: Request) {
  console.log('[WappBiz OTP] route entered');
  try {
    const { phone } = await req.json();

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Normalize phone number to E.164
    let normalizedPhone = phone.replace(/[^\d+]/g, '');
    if (!normalizedPhone.startsWith('+')) {
      if (normalizedPhone.length === 10) {
        normalizedPhone = '+91' + normalizedPhone;
      } else {
        normalizedPhone = '+' + normalizedPhone;
      }
    }

    // Cap OTP issuance per phone AND per IP — without this, an attacker can
    // spam-bomb any phone number with WhatsApp messages or drive up send costs.
    const perPhone = checkRateLimit(`otp-send:phone:${normalizedPhone}`, 3, 10 * 60 * 1000);
    const perIp = checkRateLimit(`otp-send:ip:${getClientIp(req)}`, 10, 10 * 60 * 1000);
    if (!perPhone.allowed || !perIp.allowed) {
      return NextResponse.json({ error: 'Too many requests — please wait before requesting another code' }, { status: 429 });
    }

    const otp = generateOtp();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const hashedOtp = hashOtp(otp);

    console.log(`[WhatsApp OTP] Generated verification code for ${normalizedPhone}: ${otp}`);

    try {
      const user = await db.query.users.findFirst({
        where: eq(users.phone, normalizedPhone),
      });

      if (user) {
        await db.update(users)
          .set({ otpCode: hashedOtp, otpExpires: expires, otpAttempts: 0 })
          .where(eq(users.id, user.id));
      } else {
        await db.insert(users).values({
          email: `${normalizedPhone.replace(/\D/g, '')}@dealcollab.ai`,
          phone: normalizedPhone,
          otpCode: hashedOtp,
          otpExpires: expires,
          otpAttempts: 0,
          source: 'whatsapp',
        });
      }
    } catch (dbError) {
      console.error('[WhatsApp OTP DB error]', dbError instanceof Error ? dbError.message : 'Database error');
      return NextResponse.json({ error: 'Database error processing OTP request' }, { status: 500 });
    }

    // MANDATE: WappBiz is the ONLY WhatsApp OTP delivery provider — never
    // Meta, regardless of user.source. (Meta remains available elsewhere in
    // the app for the inbound chatbot/webhook, which this route does not
    // touch — see src/lib/whatsapp/provider.ts.)
    const provider: WhatsAppProvider = 'wappbiz';
    console.log('[WappBiz OTP] provider selected');

    const res = await sendWhatsAppOTP(provider, normalizedPhone, otp);

    if (!res.success) {
      const errorCode = 'errorCode' in res ? res.errorCode : 'UNKNOWN';
      console.error(`[WhatsApp OTP] send failed: errorCode=${errorCode} error="${res.error || 'unknown'}"`);

      // Controlled response distinguishing failure causes without leaking secrets or credentials
      let statusCode = 502;
      let userMessage = res.error || 'Failed to deliver WhatsApp verification code';

      if (errorCode === 'WAPPBIZ_CONFIG_MISSING') {
        statusCode = 503;
        userMessage = 'WhatsApp verification service is temporarily unavailable';
      }

      return NextResponse.json({
        error: userMessage,
        errorCode,
        details: res.error,
        botNumber: '919373036910',
      }, { status: statusCode });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('WhatsApp OTP Error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
