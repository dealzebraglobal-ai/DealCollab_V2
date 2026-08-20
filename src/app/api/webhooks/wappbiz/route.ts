import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { processIncomingMessage } from '@/lib/whatsapp/chatbot';

/**
 * WappBiz Webhook Endpoint
 * 
 * Assumes a standard webhook payload with a JSON body containing incoming messages.
 * Uses placeholder field paths based on standard WhatsApp Cloud API shapes, 
 * as exact WappBiz documentation is not available.
 */

function verifyWappBizSignature(req: Request, rawBody: string): boolean {
  const secret = process.env.WAPPBIZ_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[wappbiz] WAPPBIZ_WEBHOOK_SECRET not set, skipping signature verification');
    return true; // Default to true if no secret configured
  }

  // TODO: Verify exact signature header name used by WappBiz
  const signature = req.headers.get('x-wappbiz-signature');
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return signature === expected || signature === `sha256=${expected}`;
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    if (!verifyWappBizSignature(req, rawBody)) {
      return new NextResponse('Invalid signature', { status: 401 });
    }

    const body = JSON.parse(rawBody);

    // TODO: Verify exact WappBiz webhook payload structure
    // We assume it follows a standard array of messages or similar structure
    const entries = body.entry || [body]; 

    for (const entry of entries) {
      const changes = entry.changes || [entry];
      for (const change of changes) {
        const value = change.value || change;
        const messages = value.messages || [];

        for (const msg of messages) {
          const phone = msg.from;
          let text = '';

          if (msg.type === 'text') {
            text = msg.text?.body || '';
          } else if (msg.type === 'interactive') {
            text = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || '';
          } else if (msg.type === 'button') {
            text = msg.button?.text || '';
          }

          if (!text || !phone) continue;

          // Process message asynchronously
          processIncomingMessage(phone, text, 'wappbiz').catch(e => {
            console.error('Failed to process WappBiz message:', e);
          });
        }
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('WappBiz webhook error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function GET(req: Request) {
  // WappBiz might require a webhook verification step similar to Meta
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WAPPBIZ_WEBHOOK_SECRET;

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      return new NextResponse(challenge, { status: 200 });
    }
    return new NextResponse('Forbidden', { status: 403 });
  }

  return new NextResponse('WappBiz Webhook Endpoint', { status: 200 });
}
