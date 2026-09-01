/**
 * DealCollab — WhatsApp webhook stage instrumentation
 * ===================================================
 * The production trace for request tfgp8-1788264419075-6cc9382124b8 showed
 * `POST /api/webhooks/wappbiz` → HTTP 200, ~3.4 s, ZERO outgoing HTTP calls,
 * and no WhatsApp reply. That is only possible if execution stopped before
 * both the AI call and the outbound-reply call — but the existing logging
 * could not say *which* stage, because there were no per-stage breadcrumbs
 * and the route's catch collapsed every failure into a bare `OK` 200.
 *
 * This module adds a correlation id + one structured log line per stage
 * (`[WA <STAGE> <RESULT>] {cid,pmid,phone,ms,...}`) so the next real inbound
 * message tells us exactly where it dies and how long each stage took.
 *
 * Never logs: API keys, access tokens, message bodies, or full phone numbers
 * (only the last 4 digits, tagged).
 */

import { describeAuthError } from "@/lib/authDiagnostics";

/** Generic Postgres/adapter error describer — names/codes only, never row values. */
export const describePgError = describeAuthError;

export type WaStage =
  | "WEBHOOK_RECEIVED"
  | "PAYLOAD_PARSED"
  | "WEBHOOK_AUTH"
  | "INBOUND_EVENT_LOOKUP"
  | "INBOUND_EVENT_CREATED"
  | "DUPLICATE_DELIVERY"
  | "PAYLOAD_VALIDATED"
  | "PROCESSING_STARTED"
  | "USER_LOOKUP"
  | "USER_CREATED"
  | "USER_FOUND"
  | "CHAT_SESSION_LOOKUP"
  | "INTENT_DETECTED"
  | "AI_REQUEST"
  | "WAPPBIZ_REQUEST"
  | "FALLBACK_SENT"
  | "WEBHOOK_COMPLETED"
  | "WEBHOOK_FAILED";

export type WaResult = "START" | "SUCCESS" | "FAILED" | "REJECTED" | "SKIPPED";

export interface WaCtx {
  correlationId: string;
  providerMessageId: string | null;
  /** Last 4 digits of the sender's number only, e.g. "…3250". Never the full number. */
  phoneTag: string | null;
  /** Set true the moment any outbound WhatsApp send resolves, so the route's
   *  catch knows whether a safe fallback reply is still needed. */
  responseSent: boolean;
  startedAt: number;
}

function genId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    /* fall through */
  }
  return `cid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function newWaCtx(providerMessageId: string | null, phone?: string | null): WaCtx {
  const digits = (phone ?? "").replace(/\D/g, "");
  return {
    correlationId: genId(),
    providerMessageId: providerMessageId ?? null,
    phoneTag: digits ? `…${digits.slice(-4)}` : null,
    responseSent: false,
    startedAt: Date.now(),
  };
}

export function waLog(
  ctx: WaCtx,
  stage: WaStage,
  result: WaResult,
  extra: Record<string, unknown> = {},
): void {
  const record = {
    cid: ctx.correlationId,
    pmid: ctx.providerMessageId,
    phone: ctx.phoneTag,
    ms: Date.now() - ctx.startedAt,
    ...extra,
  };
  try {
    console.log(`[WA ${stage} ${result}]`, JSON.stringify(record));
  } catch {
    console.log(`[WA ${stage} ${result}] cid=${ctx.correlationId} pmid=${ctx.providerMessageId}`);
  }
}
