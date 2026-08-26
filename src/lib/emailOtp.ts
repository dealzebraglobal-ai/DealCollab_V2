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

// Vercel's default serverless function timeout is 10s (Hobby) / configurable
// up to much higher on Pro, but this route has no maxDuration override, so
// it runs under the platform default. Without a bound here, a slow/hanging
// Brevo request could let Vercel's OWN timeout fire first — which returns an
// HTML platform error page, not this file's JSON error handling. Aborting at
// 8s guarantees our try/catch (and its JSON response) always wins that race.
const BREVO_REQUEST_TIMEOUT_MS = 8000;

/**
 * Brevo failure classification (2026-08-26)
 * ============================================
 * Brevo returns HTTP 401 with `"code":"unauthorized"` for BOTH an invalid
 * API key AND an IP-not-on-the-allowlist rejection — the only way to tell
 * them apart is the human-readable `message` text. IP-restriction rejections
 * mention the offending IP and link to /security/authorised_ips; this is a
 * Brevo *account security setting*, not an application bug, so it gets its
 * own user-facing message rather than the generic "try again" text (see
 * README note in sendOtpEmail below on why a code fix alone can't resolve
 * this — Vercel's standard serverless functions have no static outbound IP).
 *
 * Never logs the API key or the OTP — only Brevo's own response status/body,
 * which does not echo back the request's Authorization/api-key header.
 */
type BrevoFailureReason =
  | 'ip_not_authorized'
  | 'invalid_api_key'
  | 'sender_or_template_error'
  | 'rate_limited'
  | 'timeout'
  | 'network_error'
  | 'unexpected_response'
  | 'other';

export function classifyBrevoFailure(status: number, bodyText: string): BrevoFailureReason {
  if (status === 429) return 'rate_limited';

  let parsedCode: string | undefined;
  let parsedMessage = '';
  try {
    const parsed = JSON.parse(bodyText);
    parsedCode = parsed?.code;
    parsedMessage = String(parsed?.message ?? '');
  } catch {
    // Non-JSON body — fall through to status-based classification below.
  }

  if (status === 401) {
    const lowerMessage = parsedMessage.toLowerCase();
    if (lowerMessage.includes('ip address') || lowerMessage.includes('authorised_ips') || lowerMessage.includes('unrecognised ip')) {
      return 'ip_not_authorized';
    }
    return 'invalid_api_key';
  }

  if (status === 400) {
    // Brevo's `invalid_parameter`/`missing_parameter` codes cover a malformed
    // sender, unverified sender domain, or bad template reference.
    if (parsedCode === 'invalid_parameter' || parsedCode === 'missing_parameter') {
      return 'sender_or_template_error';
    }
  }

  return 'other';
}

const BREVO_FAILURE_USER_MESSAGE: Record<BrevoFailureReason, string> = {
  ip_not_authorized: 'Email service configuration requires administrator attention.',
  invalid_api_key: 'Email service configuration requires administrator attention.',
  sender_or_template_error: 'Email service configuration requires administrator attention.',
  rate_limited: 'Verification email service is temporarily unavailable. Please try again in a few minutes.',
  timeout: 'Verification email service is temporarily unavailable. Please try again.',
  network_error: 'Unable to send the verification email right now. Please try again.',
  unexpected_response: 'Verification email service is temporarily unavailable. Please try again later.',
  other: 'Unable to send the verification email right now. Please try again.',
};

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const { apiKey, senderEmail } = requireBrevoEnv();

  console.log('[emailOtp] Sending OTP email...', { to: email });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BREVO_REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch('https://api.brevo.com/v3/smtp/email', {
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
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[emailOtp] Brevo request timed out after', BREVO_REQUEST_TIMEOUT_MS, 'ms');
      throw new Error(BREVO_FAILURE_USER_MESSAGE.timeout);
    }
    console.error('[emailOtp] Brevo request threw:', err instanceof Error ? err.message : err);
    throw new Error(BREVO_FAILURE_USER_MESSAGE.network_error);
  } finally {
    clearTimeout(timeout);
  }

  const bodyText = await res.text();
  console.log('[emailOtp] Brevo response:', { status: res.status, body: bodyText });

  if (!res.ok) {
    const reason = classifyBrevoFailure(res.status, bodyText);
    if (reason === 'ip_not_authorized') {
      // Distinct, loud diagnostic — this is a Brevo dashboard configuration
      // issue (Security → Authorised IPs), not an application bug. Standard
      // Vercel serverless functions have no fixed outbound IP, so whichever
      // IP shows in this log is NOT guaranteed to be the IP of the next
      // invocation — see the deployment report for the actual fix options
      // (disable the IP allowlist, since the API key is never exposed to
      // the browser, or add a static-egress-IP proxy in front of Brevo).
      console.error(
        '[emailOtp] BREVO IP AUTHORIZATION FAILURE — this is a Brevo account security setting, not a code bug. ' +
        'See https://app.brevo.com/security/authorised_ips. Response:',
        bodyText,
      );
    } else {
      console.error(`[emailOtp] Brevo send failed (reason=${reason}):`, res.status, bodyText);
    }
    throw new Error(BREVO_FAILURE_USER_MESSAGE[reason]);
  }

  let messageId: string | undefined;
  try {
    messageId = JSON.parse(bodyText).messageId;
  } catch {
    // ignore parse failure, handled by the check below
  }

  if (!messageId) {
    console.error('[emailOtp] Brevo accepted request but returned no messageId:', bodyText);
    throw new Error(BREVO_FAILURE_USER_MESSAGE.unexpected_response);
  }

  console.log('[emailOtp] Email accepted by Brevo:', { messageId });
}
