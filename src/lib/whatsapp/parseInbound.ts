/**
 * DealCollab — WappBiz inbound payload parser
 * ============================================
 * Pure, dependency-free extraction of the payload-shape validation that used
 * to live inline in src/app/api/webhooks/wappbiz/route.ts, so each distinct
 * rejection reason is (a) unit-testable and (b) individually loggable.
 *
 * Text shape confirmed from real inbound deliveries on 2026-08-25. The
 * INTERACTIVE (button tap) shape is NOT documented by WappBiz — the fields
 * below mirror the Meta Cloud API webhook (which this codebase already parses
 * in /api/webhooks/whatsapp: `message.interactive.button_reply.id`,
 * `message.button.payload`, …) and are read defensively. A button tap is
 * turned into the same `text` a typed reply would produce (the button id,
 * e.g. `VIEW_MATCH:<uuid>`), so downstream routing is identical.
 */

export interface RawWappbizPayload {
  type?: string;
  version?: string;
  data?: {
    id?: string;
    from?: string;
    text?: { body?: string };
    type?: string;
    api_key?: string;
    timestamp?: string;
    from_user_id?: string;
    business_number?: string;
    // Best-effort interactive/button fields (undocumented — read defensively).
    button?: { id?: string; payload?: string; text?: string; title?: string };
    interactive?: {
      type?: string;
      button_reply?: { id?: string; title?: string };
      list_reply?: { id?: string; title?: string };
    };
    reply?: { id?: string; title?: string; payload?: string };
    payload?: string;
  };
}

export type WappbizInboundReject =
  | "NOT_JSON"
  | "NO_DATA"
  | "NOT_INCOMING_MESSAGE"
  | "UNSUPPORTED_TYPE"
  | "NO_SENDER"
  | "NO_TEXT_BODY";

export type WappbizInboundParse =
  | { ok: true; from: string; text: string; messageId: string | null; kind: "text" | "interactive" }
  | { ok: false; reason: WappbizInboundReject; detail?: string };

/**
 * Decide whether an inbound WappBiz webhook body is something the chatbot
 * should act on. Accepts `data.type === "text"` (as before) AND button /
 * interactive taps — the latter surface the button id/payload as `text` so
 * classifyWhatsAppCommand routes them deterministically.
 */
export function parseWappbizInbound(payload: RawWappbizPayload | null | undefined): WappbizInboundParse {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "NO_DATA" };
  const data = payload.data;
  if (!data || typeof data !== "object") return { ok: false, reason: "NO_DATA" };
  if (payload.type !== "incoming_message") {
    return { ok: false, reason: "NOT_INCOMING_MESSAGE", detail: safeStr(payload.type) };
  }
  if (!data.from || typeof data.from !== "string") {
    return { ok: false, reason: "NO_SENDER" };
  }
  const messageId = data.id ?? null;

  // ── Plain text (the long-standing path) ──
  if (data.type === "text") {
    const body = data.text?.body;
    if (!body || typeof body !== "string" || !body.trim()) {
      return { ok: false, reason: "NO_TEXT_BODY" };
    }
    return { ok: true, from: data.from, text: body, messageId, kind: "text" };
  }

  // ── Interactive / button tap ──
  if (["button", "interactive", "quick_reply", "list_reply", "reply"].includes(data.type ?? "")) {
    const btn = extractButtonPayload(data);
    if (btn) return { ok: true, from: data.from, text: btn, messageId, kind: "interactive" };
    return { ok: false, reason: "NO_TEXT_BODY", detail: "interactive payload had no id/title" };
  }

  return { ok: false, reason: "UNSUPPORTED_TYPE", detail: safeStr(data.type) };
}

/** Pull the actionable string (button id preferred, then payload, then title) from an interactive tap. */
export function extractButtonPayload(data: NonNullable<RawWappbizPayload["data"]>): string | null {
  const candidates = [
    data.button?.id,
    data.button?.payload,
    data.interactive?.button_reply?.id,
    data.interactive?.list_reply?.id,
    data.reply?.id,
    data.reply?.payload,
    data.payload,
    data.button?.text,
    data.button?.title,
    data.interactive?.button_reply?.title,
    data.interactive?.list_reply?.title,
    data.reply?.title,
    data.text?.body,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function safeStr(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  return String(v).slice(0, 40);
}
