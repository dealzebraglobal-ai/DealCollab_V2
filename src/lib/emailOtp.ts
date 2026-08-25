import { randomInt, createHash } from 'crypto';

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function requireBrevoEnv(): { apiKey: string; senderEmail: string } {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey || !senderEmail) {
    console.error('[emailOtp] Missing Brevo config:', {
      hasApiKey: !!apiKey,
      hasSenderEmail: !!senderEmail,
    });
    throw new Error('Email service is not configured. Please contact support.');
  }

  return { apiKey, senderEmail };
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const { apiKey, senderEmail } = requireBrevoEnv();

  console.log('[emailOtp] Sending OTP email...', { to: email });

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: 'DealCollab AI' },
      to: [{ email }],
      subject: `${code} is your DealCollab verification code`,
      htmlContent: `
        <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1F2937;">Your verification code</h2>
          <p style="color: #6B7280; font-size: 14px;">Use this code to sign in to DealCollab AI. It expires in 5 minutes.</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #F97316; margin: 24px 0;">${code}</div>
          <p style="color: #9CA3AF; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    }),
  });

  const bodyText = await res.text();
  console.log('[emailOtp] Brevo response:', { status: res.status, body: bodyText });

  if (!res.ok) {
    console.error('[emailOtp] Brevo send failed:', res.status, bodyText);
    throw new Error('Unable to send the verification email right now. Please try again.');
  }

  let messageId: string | undefined;
  try {
    messageId = JSON.parse(bodyText).messageId;
  } catch {
    // ignore parse failure, handled by the check below
  }

  if (!messageId) {
    console.error('[emailOtp] Brevo accepted request but returned no messageId:', bodyText);
    throw new Error('Verification email service is temporarily unavailable. Please try again later.');
  }

  console.log('[emailOtp] Email accepted by Brevo:', { messageId });
}
