import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { whatsappInboundEvents } from '@/db/schema';
import { processIncomingMessage } from '@/lib/whatsapp/chatbot';

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
 */

interface WappBizInboundPayload {
  type?: string;
  data?: {
    id?: string;
    from?: string;
    text?: { body?: string };
    type?: string;
    api_key?: string;
    timestamp?: string;
  };
}

export async function POST(req: Request) {
  const rawBody = await req.text().catch(() => '');

  let payload: WappBizInboundPayload | null = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    console.warn('[Wappbiz Webhook] Received non-JSON body — ignoring.');
    return new NextResponse('OK', { status: 200 });
  }

  const data = payload?.data;
  if (!data) {
    console.warn('[Wappbiz Webhook] Payload missing "data" — ignoring.');
    return new NextResponse('OK', { status: 200 });
  }

  const expectedApiKey = process.env.WAPPBIZ_API_KEY;
  const apiKeyValid = !!expectedApiKey && data.api_key === expectedApiKey;
  if (!apiKeyValid) {
    console.warn('[Wappbiz Webhook] api_key mismatch — rejecting request.');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log('[Wappbiz Webhook] Incoming event');

  // Never persist the live API key at rest — redact before storing.
  const redactedPayload = {
    ...payload,
    data: { ...data, api_key: data.api_key ? '[redacted]' : undefined },
  };

  const messageId = data.id || null;

  // Idempotency: a retried delivery of the same message id is a no-op.
  const inserted = await db
    .insert(whatsappInboundEvents)
    .values({ provider: 'wappbiz', providerMessageId: messageId, rawPayload: redactedPayload })
    .onConflictDoNothing({ target: [whatsappInboundEvents.provider, whatsappInboundEvents.providerMessageId] })
    .returning({ id: whatsappInboundEvents.id });

  if (messageId && inserted.length === 0) {
    console.log('[Wappbiz Webhook] Duplicate delivery for an already-processed message id — skipping.');
    return new NextResponse('OK', { status: 200 });
  }

  if (payload?.type !== 'incoming_message' || data.type !== 'text' || !data.from || !data.text?.body) {
    console.log(`[Wappbiz Webhook] Ignoring unsupported event (type=${payload?.type}, data.type=${data.type})`);
    return new NextResponse('OK', { status: 200 });
  }

  console.log('[Wappbiz Webhook] Message identified');

  try {
    await processIncomingMessage(data.from, data.text.body, 'wappbiz');
  } catch (err) {
    console.error('[Wappbiz Chatbot] processing failed:', err instanceof Error ? err.message : err);
    if (messageId) {
      await db
        .update(whatsappInboundEvents)
        .set({ error: err instanceof Error ? err.message : 'unknown error' })
        .where(eq(whatsappInboundEvents.providerMessageId, messageId));
    }
    // Acknowledge anyway — WappBiz has no documented retry/backoff behavior
    // to lean on, and the chatbot's own catch already sent the user a
    // friendly fallback message.
    return new NextResponse('OK', { status: 200 });
  }

  if (messageId) {
    await db
      .update(whatsappInboundEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(whatsappInboundEvents.providerMessageId, messageId));
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
