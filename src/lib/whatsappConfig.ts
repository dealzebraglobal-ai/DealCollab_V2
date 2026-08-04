/**
 * DealCollab — WhatsApp environment configuration
 * =================================================
 * No central env helper exists elsewhere in this codebase (admin.ts, whatsapp.ts,
 * auth.ts all read process.env directly) — this follows that same convention,
 * scoped to the three WhatsApp variables, with a single guarded read point so a
 * missing var logs once instead of failing silently deep in a request.
 */

export interface WhatsAppConfig {
  apiToken: string;
  phoneNumberId: string;
  verifyToken: string;
}

export function getWhatsAppConfig(): WhatsAppConfig | null {
  const apiToken = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!apiToken || !phoneNumberId || !verifyToken) {
    console.warn(
      '[whatsappConfig] Missing one or more of WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN — WhatsApp send/verify calls will no-op.',
    );
    return null;
  }

  return { apiToken, phoneNumberId, verifyToken };
}

/**
 * Meta's App Secret, used to verify the X-Hub-Signature-256 header on incoming
 * webhook POSTs (https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verify).
 * Separate from WHATSAPP_API_TOKEN — this is the app-level secret from Meta's
 * App Dashboard, not the Cloud API access token.
 */
export function getWhatsAppAppSecret(): string | null {
  return process.env.WHATSAPP_APP_SECRET || null;
}
