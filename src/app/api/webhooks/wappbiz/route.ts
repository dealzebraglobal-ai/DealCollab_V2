import { NextResponse } from 'next/server';
import { db } from '@/db';
import { whatsappInboundEvents } from '@/db/schema';

/**
 * WappBiz Inbound Webhook — DISCOVERY MODE
 * =================================================================
 * Wappbiz's API docs and Postman collection document no inbound webhook
 * payload or signature mechanism (checked 2026-08-25). Rather than guess a
 * field shape (as the previous version did — data.from/data.sender/...,
 * plus an HMAC check against a WAPPBIZ_WEBHOOK_SECRET Wappbiz never told us
 * to set — which meant inbound messages were never actually processed),
 * this endpoint captures the raw payload verbatim into
 * whatsapp_inbound_events for inspection, and does not attempt any
 * extraction or business logic yet.
 *
 * Next step once a real payload has been observed: parse the confirmed
 * fields, add idempotency via the unique (provider, provider_message_id)
 * index already in place on this table, and hand off to the existing
 * chatbot pipeline (src/lib/whatsapp/chatbot.ts → src/lib/chatPipeline.ts).
 */

export async function POST(req: Request) {
  const rawBody = await req.text().catch(() => '');

  let parsed: unknown = null;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // Not JSON — store the raw text wrapped so raw_payload (jsonb) still accepts it.
    parsed = { _nonJsonBody: rawBody };
  }

  console.log('[Wappbiz Webhook] Incoming event (discovery mode) — captured to whatsapp_inbound_events');

  try {
    await db.insert(whatsappInboundEvents).values({
      provider: 'wappbiz',
      rawPayload: parsed ?? {},
    });
  } catch (err) {
    console.error('[Wappbiz Webhook] Failed to persist raw payload:', err instanceof Error ? err.message : err);
  }

  return new NextResponse('OK', { status: 200 });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get('hub.challenge') || searchParams.get('challenge');

  if (challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('WappBiz Webhook Endpoint — discovery mode (capturing raw payloads only)', { status: 200 });
}
