/**
 * DealCollab — WappBiz inbound payload parser
 * ============================================
 * Pure, dependency-free extraction of the payload-shape validation that used
 * to live inline in src/app/api/webhooks/wappbiz/route.ts, so each distinct
 * rejection reason is (a) unit-testable and (b) individually loggable — the
 * route can now report NOT_INCOMING_MESSAGE / NOT_TEXT / NO_SENDER separately
 * instead of a single opaque "Ignoring unsupported event".
 *
 * Shape confirmed from real inbound deliveries on 2026-08-25 (see route.ts
 * header). Only data.type === "text" is processed; every other type is
 * acknowledged and ignored.
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
  };
}

export type WappbizInboundReject =
  | "NOT_JSON"
  | "NO_DATA"
  | "NOT_INCOMING_MESSAGE"
  | "NOT_TEXT"
  | "NO_SENDER"
  | "NO_TEXT_BODY";

export type WappbizInboundParse =
  | { ok: true; from: string; text: string; messageId: string | null }
  | { ok: false; reason: WappbizInboundReject; detail?: string };

/**
 * Decide whether an inbound WappBiz webhook body is a text message we should
 * hand to the chatbot. Preserves the exact accept condition the route used
 * before (`payload.type === 'incoming_message' && data.type === 'text' &&
 * data.from && data.text?.body`) — only the reporting is finer-grained.
 */
export function parseWappbizInbound(payload: RawWappbizPayload | null | undefined): WappbizInboundParse {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "NO_DATA" };
  const data = payload.data;
  if (!data || typeof data !== "object") return { ok: false, reason: "NO_DATA" };
  if (payload.type !== "incoming_message") {
    return { ok: false, reason: "NOT_INCOMING_MESSAGE", detail: safeStr(payload.type) };
  }
  if (data.type !== "text") {
    return { ok: false, reason: "NOT_TEXT", detail: safeStr(data.type) };
  }
  if (!data.from || typeof data.from !== "string") {
    return { ok: false, reason: "NO_SENDER" };
  }
  const body = data.text?.body;
  if (!body || typeof body !== "string" || !body.trim()) {
    return { ok: false, reason: "NO_TEXT_BODY" };
  }
  return { ok: true, from: data.from, text: body, messageId: data.id ?? null };
}

function safeStr(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  return String(v).slice(0, 40);
}
