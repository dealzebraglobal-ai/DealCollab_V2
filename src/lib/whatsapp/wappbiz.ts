/**
 * DealCollab — WappBiz outbound client
 * =======================================
 * Every endpoint/param/response shape here was read directly from the live
 * WappBiz dashboard (API → API Docs, https://app.wapp.biz/manage?tab=api) and
 * cross-checked against its linked Postman collection
 * (https://documenter.getpostman.com/view/31859222/2sBXVbJtrd) on 2026-08-25.
 * Nothing here is guessed — endpoints WappBiz doesn't document (interactive
 * buttons, HMAC-signed webhooks) are deliberately NOT implemented; see the
 * functions below for how each of those is handled instead.
 *
 * Confirmed:
 *   Base URL : https://api.wapp.biz/api/external
 *   Auth     : `apikey` query parameter (NOT a header, NOT Bearer)
 *   Envelope : { message, status, error, data } on success. No error-response
 *              example is shown for any endpoint — treating `error: true` (or
 *              a non-2xx HTTP status) as failure is an inference from the
 *              consistent success shape, not a confirmed error schema.
 */

const WAPPBIZ_BASE_URL = 'https://api.wapp.biz/api/external';
const REQUEST_TIMEOUT_MS = 15_000;

interface WappBizConfig {
  apiKey: string;
  /** Optional — only relevant for accounts with multiple WhatsApp business numbers. */
  businessNumber?: string;
}

function getWappBizConfig(): WappBizConfig | null {
  const apiKey = process.env.WAPPBIZ_API_KEY;
  if (!apiKey) {
    console.warn('[Wappbiz] WAPPBIZ_API_KEY not set — WappBiz send will no-op.');
    return null;
  }
  return { apiKey, businessNumber: process.env.WAPPBIZ_PHONE_NUMBER || undefined };
}

interface WappBizEnvelope<T> {
  message?: string;
  status?: number;
  error?: boolean;
  data?: T;
}

interface WappBizResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** HTTP status of the WappBiz response (0 if the request never completed). */
  status?: number;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

/**
 * Single request path for every documented WappBiz call. Auth is always the
 * `apikey` query param; body is JSON unless a FormData is supplied (the two
 * multipart media endpoints use that instead).
 */
async function wappBizRequest<T = unknown>(
  endpointPath: string,
  options: { method?: 'GET' | 'POST' | 'PUT'; body?: Record<string, unknown>; formData?: FormData } = {},
): Promise<WappBizResult<T>> {
  const config = getWappBizConfig();
  if (!config) {
    console.log(`[Wappbiz:stub] → ${endpointPath}`);
    return { success: true };
  }

  const url = `${WAPPBIZ_BASE_URL}${endpointPath}?apikey=${encodeURIComponent(config.apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const init: RequestInit = { method: options.method || 'POST', signal: controller.signal };

    if (options.formData) {
      init.body = options.formData;
    } else if (options.body) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, init);
    const rawText = await res.text().catch(() => '');

    let parsed: WappBizEnvelope<T> | undefined;
    try {
      parsed = rawText ? JSON.parse(rawText) : undefined;
    } catch {
      console.error(`[Wappbiz error] ${endpointPath} returned a non-JSON response (HTTP ${res.status})`);
      return { success: false, error: 'Wappbiz returned a malformed response' };
    }

    if (!res.ok || parsed?.error) {
      console.error(
        `[Wappbiz error] ${endpointPath} → HTTP ${res.status}${parsed?.message ? `: ${parsed.message}` : ''}`,
      );
      return { success: false, status: res.status, error: parsed?.message || `Wappbiz API returned ${res.status}` };
    }

    return { success: true, status: res.status, data: parsed?.data };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[Wappbiz error] ${endpointPath} timed out after ${REQUEST_TIMEOUT_MS}ms`);
      return { success: false, error: 'Wappbiz request timed out' };
    }
    console.error(`[Wappbiz error] ${endpointPath} threw:`, err instanceof Error ? err.message : err);
    return { success: false, error: 'Wappbiz API request failed' };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Documented endpoints actually used by DealCollab
// ---------------------------------------------------------------------------

/** POST /sendServiceTextMessage — free-form text, only deliverable inside the 24h service window. */
export async function sendServiceTextMessage(phone: string, message: string) {
  const config = getWappBizConfig();
  return wappBizRequest<{ message_id: string }>('/sendServiceTextMessage', {
    body: {
      phone: normalizePhone(phone),
      message,
      ...(config?.businessNumber ? { business_number: config.businessNumber } : {}),
    },
  });
}

/**
 * POST /checkCustomerWindow — confirms whether a customer is inside the 24h
 * service window before a free-form send is attempted.
 * The dashboard's own live sample response uses `data.windowOpen`; its linked
 * Postman collection text instead calls the field `isInsideWindow` — the two
 * WappBiz-authored sources disagree, so both are read defensively here.
 */
export async function checkCustomerWindow(
  phone: string,
): Promise<{ success: boolean; windowOpen?: boolean; error?: string }> {
  const config = getWappBizConfig();
  const res = await wappBizRequest<{ windowOpen?: boolean; isInsideWindow?: boolean }>('/checkCustomerWindow', {
    body: {
      phone: normalizePhone(phone),
      ...(config?.businessNumber ? { business_number: config.businessNumber } : {}),
    },
  });
  if (!res.success) return { success: false, error: res.error };
  return { success: true, windowOpen: res.data?.windowOpen ?? res.data?.isInsideWindow };
}

/** GET /fetchAuthTemplates — lists pre-approved authentication (OTP) templates. */
async function fetchAuthTemplates() {
  return wappBizRequest<Array<{ template_id: string; template_name: string }> | { template_id: string; template_name: string }>(
    '/fetchAuthTemplates',
    { method: 'GET' },
  );
}

/** POST /sendAuthTemplate — the documented way to deliver an OTP; works even outside the 24h window. */
async function sendAuthTemplate(params: { templateName: string; phone: string; name: string; otp: string }) {
  return wappBizRequest<{ _id: string; template_id: string; template_name: string }>('/sendAuthTemplate', {
    body: {
      template_name: params.templateName,
      phone: normalizePhone(params.phone),
      name: params.name,
      otp: params.otp,
    },
  });
}

let cachedAuthTemplateName: string | null | undefined; // undefined = not yet resolved this process lifetime

/**
 * Resolves which approved auth template to use for OTP delivery.
 * WAPPBIZ_OTP_TEMPLATE_NAME lets an operator pin a specific template; absent
 * that, we ask WappBiz which auth templates exist and use the first one —
 * there is no documented "default" auth template concept.
 */
async function resolveAuthTemplateName(): Promise<string | null> {
  const override = process.env.WAPPBIZ_OTP_TEMPLATE_NAME;
  if (override) return override;
  if (cachedAuthTemplateName !== undefined) return cachedAuthTemplateName;

  const res = await fetchAuthTemplates();
  if (!res.success || !res.data) {
    cachedAuthTemplateName = null;
    return null;
  }
  const list = Array.isArray(res.data) ? res.data : [res.data];
  cachedAuthTemplateName = list[0]?.template_name ?? null;
  return cachedAuthTemplateName;
}

// ---------------------------------------------------------------------------
// Public API — same exported signatures the rest of the app already calls
// through src/lib/whatsapp/provider.ts, now backed by documented endpoints.
// ---------------------------------------------------------------------------

/** Plain text message — used for AI chat replies and general notifications. */
export async function sendWappBizMessage(phone: string, text: string) {
  return sendServiceTextMessage(phone, text);
}

/**
 * WappBiz's documented Messages APIs are sendServiceTextMessage,
 * sendContactMessage, sendServiceMediaMessage, and sendMultiMediaMessage —
 * there is no interactive/button message endpoint. Rather than invent one
 * (as the previous implementation did with `/v1/messages/interactive`),
 * this degrades to a plain text message listing the options.
 *
 * NOTE: once the inbound webhook is implemented, its command parser
 * (src/lib/whatsapp/chatbot.ts) will need to recognize a numeric reply
 * ("1", "2", "3") in addition to the button-id-style commands it expects
 * today, since a user is now replying to numbered text, not tapping a button.
 */
// Self-disabling: once WappBiz answers the interactive endpoint with a
// structural error (404 unknown route / 400 bad param), stop calling it for
// the rest of this process and go straight to numbered text — so a provider
// that has NOT actually shipped buttons costs at most one extra round-trip,
// once, not on every message (Problem 1: response speed).
let interactiveButtonsDisabled = process.env.WAPPBIZ_BUTTONS_DISABLED === '1';

const WAPPBIZ_BUTTON_ENDPOINT = process.env.WAPPBIZ_BUTTONS_ENDPOINT || '/sendServiceButtonMessage';

/** Numbered-text rendering — the always-available fallback and the pre-buttons behaviour. */
function buttonsAsNumberedText(text: string, buttons: Array<{ id: string; title: string }>): string {
  const optionsText = buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n');
  return `${text}\n\n${optionsText}\n\n_Reply with the option number._`;
}

/**
 * Interactive reply buttons. Sends via WappBiz's button endpoint — same
 * envelope as /sendServiceTextMessage plus a `buttons` array of {id,title}
 * (confirmed shape). On ANY failure it falls back to numbered text, so the
 * pre-existing behaviour is never lost. WhatsApp caps quick-reply buttons at 3.
 */
export async function sendWappBizButtons(phone: string, text: string, buttons: Array<{ id: string; title: string }>) {
  const trimmed = buttons.slice(0, 3);

  if (!interactiveButtonsDisabled && trimmed.length > 0) {
    const config = getWappBizConfig();
    // Loud, structured diagnostics — this is the ONLY way to tell whether
    // (A) we never send, (B) our payload is invalid, (C) WappBiz rejects it,
    // or (D) WappBiz accepts but WhatsApp doesn't render. No phone/keys logged.
    console.log(`[WAPPBIZ INTERACTIVE] action=send endpoint=${WAPPBIZ_BUTTON_ENDPOINT} buttonCount=${trimmed.length}`);
    const res = await wappBizRequest<{ message_id?: string }>(WAPPBIZ_BUTTON_ENDPOINT, {
      body: {
        phone: normalizePhone(phone),
        message: text,
        buttons: trimmed.map((b) => ({ id: b.id, title: b.title })),
        ...(config?.businessNumber ? { business_number: config.businessNumber } : {}),
      },
    });
    console.log(`[WAPPBIZ INTERACTIVE] responseStatus=${res.status ?? 0} success=${res.success}`);
    if (res.success) return res;

    // NEVER silently fall back — surface the exact reason at error level.
    console.error(
      `[WAPPBIZ INTERACTIVE] send FAILED — status=${res.status ?? 0} reason="${res.error ?? 'unknown'}". ` +
        `Falling back to numbered text. If status=404 the '${WAPPBIZ_BUTTON_ENDPOINT}' endpoint does not exist on this ` +
        `WappBiz plan — set WAPPBIZ_BUTTONS_ENDPOINT to the correct path or confirm WappBiz supports interactive messages.`,
    );
    if (res.status === 404 || res.status === 400) {
      interactiveButtonsDisabled = true;
      console.error(`[WAPPBIZ INTERACTIVE] endpoint disabled for this process after HTTP ${res.status} — numbered text only until redeploy.`);
    }
  }

  return sendServiceTextMessage(phone, buttonsAsNumberedText(text, trimmed.length ? trimmed : buttons));
}

/** Test/diagnostics hook — reflects whether the process has disabled the button endpoint. */
export function __isInteractiveButtonsDisabled(): boolean {
  return interactiveButtonsDisabled;
}

/**
 * OTP delivery — via the documented sendAuthTemplate endpoint ONLY.
 *
 * DELIBERATELY does not fall back to sendServiceTextMessage / the 24h
 * customer-window check. An OTP login must work for ANY valid WhatsApp
 * number, including one that has never messaged the business before —
 * gating delivery on "has this number messaged us recently" would make
 * login impossible for a brand-new user, which defeats the purpose of the
 * feature (an earlier version of this function did exactly that as a
 * stopgap; removed — it was a workaround, not the required behavior).
 *
 * Confirmed live via fetchAuthTemplates on 2026-08-27: this WappBiz
 * account has ZERO approved authentication templates, so this currently
 * always fails with a clear, actionable error. That is a WappBiz dashboard
 * configuration gap (approve an authentication template, or set
 * WAPPBIZ_OTP_TEMPLATE_NAME to pin one), not a code defect — see the
 * deployment report for exactly what needs to be configured.
 */
export async function sendWappBizOTP(phone: string, otp: string) {
  const config = getWappBizConfig();
  if (!config) {
    console.log(`[Wappbiz:stub] OTP → ${normalizePhone(phone)}`);
    return { success: true };
  }

  const templateName = await resolveAuthTemplateName();
  if (!templateName) {
    console.error(
      '[Wappbiz error] No authentication template available for OTP delivery. Set WAPPBIZ_OTP_TEMPLATE_NAME or approve an authentication template in the Wappbiz dashboard.',
    );
    return { success: false, error: 'No Wappbiz authentication template available for OTP delivery' };
  }

  return sendAuthTemplate({ templateName, phone, name: 'DealCollab User', otp });
}

/**
 * Match notification with a "View Match" magic-link CTA (Feature 7).
 * This is a proactive, unsolicited send (not a reply to an inbound message),
 * so per WappBiz's documented 24h-window rule it can only go out as free
 * text while the customer is inside that window. No match-notification
 * template is provisioned in this account, so outside the window this
 * fails loudly instead of attempting an undocumented workaround.
 */
import { formatMatchScore } from '@/utils/formatters';

export async function sendWappBizMatchNotification(
  phone: string,
  params: { companySummary: string; matchScore: number; magicLinkUrl: string },
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!getWappBizConfig()) {
    console.log(`[Wappbiz DEV] Match notification to ${phone} suppressed (Wappbiz not configured)`);
    return { success: true };
  }

  const windowCheck = await checkCustomerWindow(phone);
  if (!windowCheck.success) {
    return { success: false, error: windowCheck.error || 'Failed to check Wappbiz service window' };
  }
  if (!windowCheck.windowOpen) {
    console.warn('[Wappbiz] Recipient is outside the 24h service window — no approved template exists for match notifications, skipping send.');
    return { success: false, error: 'Outside 24h service window; no approved match-notification template configured' };
  }

  const { companySummary, matchScore, magicLinkUrl } = params;
  const text =
    `New match found on DealCollab 🎯\n\n` +
    `${companySummary}\n` +
    `Match score: ${formatMatchScore(matchScore)}\n\n` +
    `View Match: ${magicLinkUrl}`;
  return sendServiceTextMessage(phone, text);
}

export const sendMatchNotification = sendWappBizMatchNotification;
