import { getWhatsAppConfig } from './whatsappConfig';

/**
 * DealCollab — WhatsApp send helpers (Meta Cloud API)
 * =====================================================
 * ASSUMPTION: Meta WhatsApp Cloud API (not Twilio) — matches the env var
 * names requested (WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID), which are
 * Cloud API's naming, not Twilio's (Twilio uses account SID + auth token).
 *
 * Falls back to a console.log stub when WHATSAPP_API_TOKEN /
 * WHATSAPP_PHONE_NUMBER_ID aren't configured, so local dev and CI never hard
 * fail on a missing production credential.
 */

const GRAPH_API_VERSION = 'v21.0';

async function sendCloudApiMessage(phone: string, payload: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const config = getWhatsAppConfig();
  if (!config) {
    console.log(`[whatsapp:stub] → ${phone}:`, JSON.stringify(payload));
    return { success: true };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone.replace(/[^\d]/g, ''),
        ...payload,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[whatsapp] send failed (${res.status})`, body.slice(0, 300));
      return { success: false, error: `WhatsApp API returned ${res.status}` };
    }

    return { success: true };
  } catch (err) {
    console.error('[whatsapp] send threw:', err instanceof Error ? err.message : err);
    return { success: false, error: 'WhatsApp API request failed' };
  }
}

/** Plain text message — used for AI chat replies and general notifications. */
export async function sendWhatsAppMessage(phone: string, text: string) {
  return sendCloudApiMessage(phone, { type: 'text', text: { body: text } });
}

/** Interactive Button message — allows up to 3 reply buttons per message in WhatsApp Cloud API. */
export async function sendWhatsAppButtons(phone: string, text: string, buttons: Array<{ id: string; title: string }>) {
  let bodyText = text;
  // If body is longer than 1000 chars, send full text first, then buttons with a summary prompt
  if (bodyText.length > 1000) {
    await sendWhatsAppMessage(phone, bodyText);
    bodyText = 'Select an option below to view details or proceed:';
  }
  return sendCloudApiMessage(phone, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map(btn => ({
          type: 'reply',
          reply: {
            id: btn.id.slice(0, 256),
            title: btn.title.slice(0, 20), // Meta limit is 20 chars
          },
        })),
      },
    },
  });
}

/** Preserves the original signature — existing callers (if any) keep working unchanged. */
export async function sendWhatsAppOTP(phone: string, otp: string) {
  // If using a verified template for OTP, this would be a template message.
  // For dev/testing with a generic number, we send it as a standard text.
  // Note: Meta strictly enforces templates for business-initiated messages.
  const message = `Your DealCollab verification code is: ${otp}. It expires in 10 minutes.`;
  return sendWhatsAppMessage(phone, message);
}

/** Match notification with a "View Match" magic-link CTA (Feature 7). */
export async function sendWhatsAppMatchNotification(phone: string, params: {
  companySummary: string;
  matchScore: number;
  magicLinkUrl: string;
}) {
  const { companySummary, matchScore, magicLinkUrl } = params;
  const text =
    `New match found on DealCollab 🎯\n\n` +
    `${companySummary}\n` +
    `Match score: ${Math.round(matchScore)}%\n\n` +
    `View Match: ${magicLinkUrl}`;
  return sendWhatsAppMessage(phone, text);
}
