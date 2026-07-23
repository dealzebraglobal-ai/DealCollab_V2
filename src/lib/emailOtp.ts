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

// Brevo's send endpoint returns 201 even when the account has no sending
// credits left — it only reports that failure asynchronously in the event
// log, not in the send response. Check the balance up front so we never
// report "success" for an email that was silently dropped.
async function assertBrevoHasCredits(apiKey: string): Promise<void> {
  const res = await fetch('https://api.brevo.com/v3/account', {
    headers: { Accept: 'application/json', 'api-key': apiKey },
  });

  if (!res.ok) {
    console.error('[emailOtp] Brevo account check failed:', res.status, await res.text().catch(() => ''));
    throw new Error('Unable to verify email service status. Please try again.');
  }

  const body = await res.json().catch(() => null) as { plan?: { credits?: number }[] } | null;
  const credits = body?.plan?.[0]?.credits;

  console.log('[emailOtp] Brevo credit check:', { credits });

  if (typeof credits === 'number' && credits <= 0) {
    console.error('[emailOtp] Brevo account has insufficient credits');
    throw new Error('Email service is temporarily unavailable (out of send credits). Please contact support.');
  }
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const { apiKey, senderEmail } = requireBrevoEnv();

  console.log('[emailOtp] Sending OTP email...', { to: email });

  await assertBrevoHasCredits(apiKey);

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
    let reason = 'Failed to send verification email';
    try {
      const parsed = JSON.parse(bodyText);
      reason = parsed.message || reason;
    } catch {
      // body wasn't JSON, keep default reason
    }
    console.error('[emailOtp] Brevo send failed:', res.status, reason);
    throw new Error(reason);
  }

  let messageId: string | undefined;
  try {
    messageId = JSON.parse(bodyText).messageId;
  } catch {
    // ignore parse failure, handled by the check below
  }

  if (!messageId) {
    console.error('[emailOtp] Brevo accepted request but returned no messageId:', bodyText);
    throw new Error('Email service did not confirm the email was accepted.');
  }

  console.log('[emailOtp] Email accepted by Brevo:', { messageId });
}
