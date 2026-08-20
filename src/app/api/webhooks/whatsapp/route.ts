import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getWhatsAppAppSecret } from '@/lib/whatsappConfig';
import { processIncomingMessage } from '@/lib/whatsapp/chatbot';

/**
 * Verifies Meta's X-Hub-Signature-256 header against the raw request body.
 * Without this, anyone who finds this public URL can POST a fabricated
 * "incoming message" payload and have it create users / drive the LLM chat
 * pipeline as if it came from WhatsApp. Signature must be read from the RAW
 * body (before JSON.parse) since Meta signs the exact bytes sent.
 *
 * If WHATSAPP_APP_SECRET isn't configured, this warns and allows the request
 * through rather than hard-failing — that keeps existing deployments working
 * until the secret is added to the environment (see security report).
 */
function isValidWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = getWhatsAppAppSecret();
  if (!appSecret) {
    console.warn('[whatsapp webhook] WHATSAPP_APP_SECRET not set — skipping signature verification (INSECURE, configure this in production).');
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

// POST: Receive messages from WhatsApp users
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();

    if (!isValidWhatsAppSignature(rawBody, req.headers.get('x-hub-signature-256'))) {
      console.error('[whatsapp webhook] Invalid or missing X-Hub-Signature-256 — rejecting request.');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody);

    // Standard Meta Cloud API webhook structure
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.value && change.value.messages && change.value.messages[0]) {
            const message = change.value.messages[0];
            const phone = message.from; // Sender's phone (e.g. 919876543210)
            const text = message.text?.body || message.interactive?.button_reply?.id || message.interactive?.button_reply?.title || message.interactive?.list_reply?.id || message.interactive?.list_reply?.title;

            if (!text) continue; // Ignore non-text / non-interactive messages for now

            // Process message asynchronously so we can quickly ack Meta
            processIncomingMessage(phone, text, 'meta').catch(e => {
              console.error('Failed to process WhatsApp message:', e);
            });
          }
        }
      }
      return NextResponse.json({ success: true }, { status: 200 });
    }

    // Fallback for custom testing (direct POST)
    const { phone, message } = body;
    if (phone && message) {
      await processIncomingMessage(phone, message, 'meta');
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  } catch (error) {
    console.error('WhatsApp Webhook Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


