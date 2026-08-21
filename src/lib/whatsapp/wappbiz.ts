export interface WappBizConfig {
  apiKey: string;
  apiUrl: string;
  phoneNumber: string;
}

export function getWappBizConfig(): WappBizConfig | null {
  const apiKey = process.env.WAPPBIZ_API_KEY;
  const apiUrl = process.env.WAPPBIZ_API_URL;
  const phoneNumber = process.env.WAPPBIZ_PHONE_NUMBER;

  if (!apiKey || !apiUrl || !phoneNumber) {
    console.warn(
      '[wappbiz] Missing WAPPBIZ_API_KEY, WAPPBIZ_API_URL, or WAPPBIZ_PHONE_NUMBER — WappBiz send will no-op.',
    );
    return null;
  }

  return { apiKey, apiUrl, phoneNumber };
}

export async function sendWappBizApiMessage(endpointSuffix: string, payload: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const config = getWappBizConfig();
  if (!config) {
    console.log(`[wappbiz:stub] → ${endpointSuffix}:`, JSON.stringify(payload));
    return { success: true };
  }

  try {
    const endpoint = `${config.apiUrl.replace(/\/$/, '')}${endpointSuffix}`;
    
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[wappbiz] send failed (${res.status})`, body.slice(0, 300));
      return { success: false, error: `WappBiz API returned ${res.status}` };
    }

    return { success: true };
  } catch (err) {
    console.error('[wappbiz] send threw:', err instanceof Error ? err.message : err);
    return { success: false, error: 'WappBiz API request failed' };
  }
}

/** Plain text message — used for AI chat replies and general notifications. */
export async function sendWappBizMessage(phone: string, text: string) {
  return sendWappBizApiMessage('/v1/messages/text', { 
    to: phone.replace(/[^\d]/g, ''), 
    body: text 
  });
}

/** Interactive Button message — allows up to 3 reply buttons per message. */
export async function sendWappBizButtons(phone: string, text: string, buttons: Array<{ id: string; title: string }>) {
  let bodyText = text;
  if (bodyText.length > 1000) {
    await sendWappBizMessage(phone, bodyText);
    bodyText = 'Select an option below to view details or proceed:';
  }
  
  return sendWappBizApiMessage('/v1/messages/interactive', {
    to: phone.replace(/[^\d]/g, ''),
    kind: 'buttons',
    body: bodyText,
    buttons: buttons.slice(0, 3).map(btn => ({
      id: btn.id.slice(0, 256),
      title: btn.title.slice(0, 20),
    }))
  });
}

/** Preserves the original signature for OTP. */
export async function sendWappBizOTP(phone: string, otp: string) {
  const message = `Your DealCollab verification code is: ${otp}. It expires in 10 minutes.`;
  return sendWappBizMessage(phone, message);
}

/** Match notification with a "View Match" magic-link CTA (Feature 7). */
export async function sendWappBizMatchNotification(phone: string, params: {
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
  return sendWappBizMessage(phone, text);
}
