import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { whatsappInboundEvents } from '@/db/schema';
import { processIncomingMessage } from '@/lib/whatsapp/chatbot';
import { sendWappBizMessage } from '@/lib/whatsapp/wappbiz';
import { parseWappbizInbound, type RawWappbizPayload } from '@/lib/whatsapp/parseInbound';
import { newWaCtx, waLog, describePgError } from '@/lib/whatsapp/webhookDiagnostics';

/**
 * WappBiz Inbound Webhook
 * =================================================================
 * WappBiz's API docs and Postman collection document no inbound webhook
 * payload or signature mechanism. This shape was instead confirmed from two
 * real inbound deliveries captured verbatim (via a discovery-mode version of
 * this handler) on 2026-08-25:
 *
 *   {
 *     "type": "incoming_message",
 *     "version": "1.0",
 *     "data": {
 *       "id": "wamid.HBgMOTE4ODUwMzMzMjUwFQIA...",  // WhatsApp message id
 *       "from": "918850333250",                     // sender phone, digits only, no '+'
 *       "text": { "body": "Hi" },                    // present when data.type === "text"
 *       "type": "text",
 *       "api_key": "<the account's own WAPPBIZ_API_KEY>",
 *       "timestamp": "1787645664",                   // unix seconds, as a string
 *       "from_user_id": "IN.988413714234800",
 *       "business_number": "919373036910"
 *     }
 *   }
 *
 * Authentication: WappBiz echoes the account's own API key back in
 * data.api_key — that's how it proves the call is really from WappBiz. This
 * was observed directly from real traffic, not documented and not an
 * invented HMAC scheme. Every other data.type (media, buttons, etc.) is
 * acknowledged and ignored rather than guessed at, since only "text" has
 * been observed so far.
 *
 * INSTRUMENTATION (2026-09-01): every stage now emits a `[WA <STAGE> <RESULT>]`
 * log line keyed by a correlation id (see webhookDiagnostics.ts). The handler
 * still returns 200 to WappBiz on any downstream failure (WappBiz has no
 * documented retry/backoff), but the failure is now (a) logged with its
 * Postgres/error code, (b) persisted to whatsapp_inbound_events.error, and
 * (c) answered with a plain-text fallback to the user IF no reply was sent.
 */

export async function POST(req: Request) {
  const rawBody = await req.text().catch(() => '');

  let payload: RawWappbizPayload | null = null;
  let jsonOk = true;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as RawWappbizPayload) : null;
  } catch {
    jsonOk = false;
  }

  const ctx = newWaCtx(payload?.data?.id ?? null, payload?.data?.from ?? null);
  waLog(ctx, 'WEBHOOK_RECEIVED', 'START', { bytes: rawBody.length, jsonOk });

  if (!jsonOk) {
    waLog(ctx, 'PAYLOAD_PARSED', 'REJECTED', { reason: 'NOT_JSON' });
    return new NextResponse('OK', { status: 200 });
  }

  const data = payload?.data;
  if (!data) {
    waLog(ctx, 'PAYLOAD_PARSED', 'REJECTED', { reason: 'NO_DATA' });
    return new NextResponse('OK', { status: 200 });
  }
  waLog(ctx, 'PAYLOAD_PARSED', 'SUCCESS', { type: payload?.type, dataType: data.type });

  const expectedApiKey = process.env.WAPPBIZ_API_KEY;
  const apiKeyValid = !!expectedApiKey && data.api_key === expectedApiKey;
  if (!apiKeyValid) {
    waLog(ctx, 'WEBHOOK_AUTH', 'FAILED', { hasExpectedKey: !!expectedApiKey });
    return new NextResponse('Unauthorized', { status: 401 });
  }
  waLog(ctx, 'WEBHOOK_AUTH', 'SUCCESS');

  // Never persist the live API key at rest — redact before storing.
  const redactedPayload = {
    ...payload,
    data: { ...data, api_key: data.api_key ? '[redacted]' : undefined },
  };

  const messageId = data.id || null;

  // Idempotency: a retried delivery of the same message id is a no-op.
  let inserted: Array<{ id: string }>;
  try {
    waLog(ctx, 'INBOUND_EVENT_LOOKUP', 'START');
    inserted = await db
      .insert(whatsappInboundEvents)
      .values({ provider: 'wappbiz', providerMessageId: messageId, rawPayload: redactedPayload })
      .onConflictDoNothing({ target: [whatsappInboundEvents.provider, whatsappInboundEvents.providerMessageId] })
      .returning({ id: whatsappInboundEvents.id });
  } catch (err) {
    // Previously an unhandled throw here → HTTP 500. Now logged (with pg code)
    // and acked, so a table/constraint problem is visible instead of a bare 500.
    waLog(ctx, 'INBOUND_EVENT_CREATED', 'FAILED', { ...describePgError(err) });
    return new NextResponse('OK', { status: 200 });
  }

  if (messageId && inserted.length === 0) {
    waLog(ctx, 'DUPLICATE_DELIVERY', 'SKIPPED');
    return new NextResponse('OK', { status: 200 });
  }
  waLog(ctx, 'INBOUND_EVENT_CREATED', 'SUCCESS');

  const parsed = parseWappbizInbound(payload);
  if (!parsed.ok) {
    waLog(ctx, 'PAYLOAD_VALIDATED', 'REJECTED', { reason: parsed.reason, detail: parsed.detail });
    return new NextResponse('OK', { status: 200 });
  }
  waLog(ctx, 'PAYLOAD_VALIDATED', 'SUCCESS');

  try {
    waLog(ctx, 'PROCESSING_STARTED', 'START');
    await processIncomingMessage(parsed.from, parsed.text, 'wappbiz', ctx);
    waLog(ctx, 'WEBHOOK_COMPLETED', 'SUCCESS', { responseSent: ctx.responseSent });
  } catch (err) {
    const info = describePgError(err);
    waLog(ctx, 'WEBHOOK_FAILED', 'FAILED', { ...info, responseSent: ctx.responseSent });

    if (messageId) {
      await db
        .update(whatsappInboundEvents)
        .set({
          error: `[${info.errorClass}${info.code ? ' ' + info.code : ''}${info.column ? ' col=' + info.column : ''}] ${info.message}`.slice(0, 500),
        })
        .where(eq(whatsappInboundEvents.providerMessageId, messageId))
        .catch((e) => waLog(ctx, 'WEBHOOK_FAILED', 'FAILED', { note: 'error-persist-failed', ...describePgError(e) }));
    }

    // Safe fallback: only when processIncomingMessage never got a reply out.
    if (!ctx.responseSent) {
      try {
        await sendWappBizMessage(
          parsed.from,
          "Sorry — I hit a snag processing that. Please send your message again in a moment.",
        );
        ctx.responseSent = true;
        waLog(ctx, 'FALLBACK_SENT', 'SUCCESS');
      } catch (e) {
        waLog(ctx, 'FALLBACK_SENT', 'FAILED', { ...describePgError(e) });
      }
    }

    // Acknowledge anyway — WappBiz has no documented retry/backoff behavior.
    return new NextResponse('OK', { status: 200 });
  }

  if (messageId) {
    await db
      .update(whatsappInboundEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(whatsappInboundEvents.providerMessageId, messageId))
      .catch((e) => waLog(ctx, 'WEBHOOK_COMPLETED', 'FAILED', { note: 'processed-flag-persist-failed', ...describePgError(e) }));
  }

  return new NextResponse('OK', { status: 200 });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get('hub.challenge') || searchParams.get('challenge');

  if (challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('WappBiz Webhook Endpoint Ready', { status: 200 });
}
