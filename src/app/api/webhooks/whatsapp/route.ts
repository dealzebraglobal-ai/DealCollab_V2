import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getWhatsAppAppSecret } from '@/lib/whatsappConfig';
import { processIncomingMessage } from '@/lib/whatsapp/chatbot';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
import { db } from '@/db';
import { whatsappInboundEvents } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { newWaCtx, waLog, describePgError } from '@/lib/whatsapp/webhookDiagnostics';

/**
 * Verifies Meta's X-Hub-Signature-256 header against the raw request body.
 * Without this, anyone who finds this public URL can POST a fabricated
 * "incoming message" payload and have it create users / drive the LLM chat
 * pipeline as if it came from WhatsApp. Signature must be read from the RAW
 * body (before JSON.parse) since Meta signs the exact bytes sent.
 *
 * SECURITY: previously, a missing WHATSAPP_APP_SECRET made this fail OPEN
 * (return true, allowing any unsigned request through) — this session has
 * already found two other providers (WAPPBIZ_API_KEY, BREVO_API_KEY) where
 * the local .env had a value but Vercel Production did not, so "the secret
 * might not actually be configured in production" is a real, demonstrated
 * risk here, not a hypothetical. Now fails CLOSED in production/preview;
 * local dev (no VERCEL_ENV) still allows testing without the secret set.
 */
function isValidWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = getWhatsAppAppSecret();
  if (!appSecret) {
    if (process.env.VERCEL_ENV) {
      console.error('[whatsapp webhook] WHATSAPP_APP_SECRET not set in a deployed environment — rejecting all requests.');
      return false;
    }
    console.warn('[whatsapp webhook] WHATSAPP_APP_SECRET not set — skipping signature verification (local dev only).');
    return true;
  }

  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const provided = signatureHeader.slice('sha256='.length);

  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');
  if (expectedBuf.length !== providedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

// GET: Meta Webhook Verification
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WhatsApp Webhook Verified');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Invalid verification token' }, { status: 403 });
}

/**
 * Reliability hardening (2026-09-07): this route previously had none of the
 * production guards the sibling WappBiz webhook (src/app/api/webhooks/wappbiz)
 * already carries, despite driving the exact same chatbot pipeline:
 *
 *   1. NO idempotency — Meta explicitly documents that the same delivery can
 *      arrive more than once (retries on a slow/failed ack, or duplicate
 *      sends). Every redelivery re-ran processIncomingMessage, which can
 *      insert a duplicate mandate/match and send a duplicate WhatsApp reply.
 *   2. Fire-and-forget with only a console.error on failure — an AI/DB error
 *      left the user with total silence, no "try again" fallback, unlike the
 *      WappBiz path.
 *   3. A bare 500 on ANY thrown error (including inside the per-message loop,
 *      since the fire-and-forget promise's rejection was never awaited before
 *      responding) — Meta's Cloud API retries non-2xx webhook responses, so a
 *      transient failure could compound into repeated duplicate processing
 *      once idempotency is added elsewhere but the response code doesn't ack.
 *
 * Fix reuses the exact pattern already proven on the WappBiz route — same
 * `whatsapp_inbound_events` table (provider='meta'), same correlation-id
 * diagnostics, same "safe fallback text if no reply went out" behavior — no
 * new mechanism invented, and processIncomingMessage/runChatTurn/
 * resolveCompletion (the already-fixed P0 conversation logic) are untouched.
 */
async function handleMetaMessage(message: {
  id?: string;
  from: string;
  text?: { body?: string };
  interactive?: {
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
}) {
  const messageId = message.id ?? null;
  const phone = message.from;
  const ctx = newWaCtx(messageId, phone);
  waLog(ctx, 'WEBHOOK_RECEIVED', 'START', { provider: 'meta' });

  const text =
    message.text?.body ||
    message.interactive?.button_reply?.id ||
    message.interactive?.button_reply?.title ||
    message.interactive?.list_reply?.id ||
    message.interactive?.list_reply?.title;

  if (!text) {
    waLog(ctx, 'PAYLOAD_VALIDATED', 'REJECTED', { reason: 'NO_TEXT' });
    return;
  }

  // Idempotency: a retried delivery of the same Meta message id is a no-op.
  if (messageId) {
    try {
      const inserted = await db
        .insert(whatsappInboundEvents)
        .values({ provider: 'meta', providerMessageId: messageId, rawPayload: { from: phone } })
        .onConflictDoNothing({ target: [whatsappInboundEvents.provider, whatsappInboundEvents.providerMessageId] })
        .returning({ id: whatsappInboundEvents.id });
      if (inserted.length === 0) {
        waLog(ctx, 'DUPLICATE_DELIVERY', 'SKIPPED');
        return;
      }
      waLog(ctx, 'INBOUND_EVENT_CREATED', 'SUCCESS');
    } catch (err) {
      // If the dedup write itself fails, fail open (process the message) rather
      // than silently dropping a genuine inbound message — logged for visibility.
      waLog(ctx, 'INBOUND_EVENT_CREATED', 'FAILED', { ...describePgError(err) });
    }
  }

  try {
    waLog(ctx, 'PROCESSING_STARTED', 'START');
    await processIncomingMessage(phone, text, 'meta', ctx);
    waLog(ctx, 'WEBHOOK_COMPLETED', 'SUCCESS', { responseSent: ctx.responseSent });
  } catch (err) {
    waLog(ctx, 'WEBHOOK_FAILED', 'FAILED', { ...describePgError(err), responseSent: ctx.responseSent });
    if (messageId) {
      await db
        .update(whatsappInboundEvents)
        .set({ error: describePgError(err).message?.slice(0, 500) ?? 'unknown error' })
        .where(eq(whatsappInboundEvents.providerMessageId, messageId))
        .catch((e) => waLog(ctx, 'WEBHOOK_FAILED', 'FAILED', { note: 'error-persist-failed', ...describePgError(e) }));
    }
    if (!ctx.responseSent) {
      try {
        await sendWhatsAppMessage('meta', phone, "Sorry — I hit a snag processing that. Please send your message again in a moment.");
        ctx.responseSent = true;
        waLog(ctx, 'FALLBACK_SENT', 'SUCCESS');
      } catch (e) {
        waLog(ctx, 'FALLBACK_SENT', 'FAILED', { ...describePgError(e) });
      }
    }
    return;
  }

  if (messageId) {
    await db
      .update(whatsappInboundEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(whatsappInboundEvents.providerMessageId, messageId))
      .catch((e) => waLog(ctx, 'WEBHOOK_COMPLETED', 'FAILED', { note: 'processed-flag-persist-failed', ...describePgError(e) }));
  }
}

// POST: Receive messages from WhatsApp users
export async function POST(req: Request) {
  const rawBody = await req.text().catch(() => '');

  if (!isValidWhatsAppSignature(rawBody, req.headers.get('x-hub-signature-256'))) {
    console.error('[whatsapp webhook] Invalid or missing X-Hub-Signature-256 — rejecting request.');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    // Malformed JSON from an authenticated caller — ack rather than 500, same
    // policy as the WappBiz route (Meta has no documented retry/backoff).
    return NextResponse.json({ success: true }, { status: 200 });
  }

  // Standard Meta Cloud API webhook structure
  if (body.object === 'whatsapp_business_account') {
    const entries = (body.entry as Array<{ changes?: Array<{ value?: { messages?: unknown[] } }> }> | undefined) || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const message = change.value?.messages?.[0] as Parameters<typeof handleMetaMessage>[0] | undefined;
        if (!message) continue;
        // Awaited (not fire-and-forget): guarantees the idempotency row is
        // written and any failure fallback is sent before Meta's request
        // completes, and keeps this handler's own errors from producing a
        // 500 that Meta would retry into a duplicate-processing loop.
        try {
          await handleMetaMessage(message);
        } catch (e) {
          console.error('[whatsapp webhook] unhandled error processing message:', e);
        }
      }
    }
    return NextResponse.json({ success: true }, { status: 200 });
  }

  // Fallback for custom testing (direct POST) — not a real Meta delivery, so
  // no idempotency/dedup is needed here.
  const { phone, message } = body as { phone?: string; message?: string };
  if (phone && message) {
    try {
      await processIncomingMessage(phone, message, 'meta');
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('WhatsApp Webhook Error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
}


