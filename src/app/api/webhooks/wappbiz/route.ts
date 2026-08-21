import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { processIncomingMessage } from '@/lib/whatsapp/chatbot';

/**
 * WappBiz Webhook Endpoint
 * 
 * Subscribed to "message.received" events.
 * Dynamically verifies HMAC signature across all headers since the exact header name is undocumented.
 */

// Basic in-memory idempotency for fast retries
const processedMessageIds = new Set<string>();

function verifyWappBizSignature(req: Request, rawBody: string): boolean {
  const secret = process.env.WAPPBIZ_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[wappbiz] WAPPBIZ_WEBHOOK_SECRET not set, cannot verify signature.');
    return false; // Fail if secret is missing to enforce authentication
  }

  const expectedSha256 = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
    
  const expectedSha1 = crypto
    .createHmac('sha1', secret)
    .update(rawBody)
    .digest('hex');

  // Dynamically search all headers for the signature
  for (const [key, value] of req.headers.entries()) {
    if (value === expectedSha256 || value === `sha256=${expectedSha256}`) {
       console.log(`[wappbiz] Signature validated using header: ${key} (SHA256)`);
       return true;
    }
    if (value === expectedSha1 || value === `sha1=${expectedSha1}`) {
       console.log(`[wappbiz] Signature validated using header: ${key} (SHA1)`);
       return true;
    }
  }

  // Safe logging of header names and content type if verification fails
  const safeHeaders = Object.fromEntries(
    Array.from(req.headers.entries()).filter(([k]) => !k.toLowerCase().includes('authorization'))
  );
  console.warn('[wappbiz] Signature verification failed. Received headers:', safeHeaders);
  return false;
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    
    if (!verifyWappBizSignature(req, rawBody)) {
      return new NextResponse('Unauthorized: Invalid Signature', { status: 401 });
    }
    
    let body;
    try {
      body = JSON.parse(rawBody);
      console.log(`[wappbiz] Webhook payload structure:`, JSON.stringify(body, null, 2).substring(0, 500));
    } catch {
      return new NextResponse('Invalid JSON', { status: 400 });
    }

    // WappBiz might send an array or a single object.
    const events = Array.isArray(body) ? body : [body];

    for (const event of events) {
      // We only care about message received events if there's an event type
      if (event.event && event.event !== 'message.received') continue;
      
      // Data might be nested under `data` or it might be the top-level event itself
      const data = event.data || event;

      // Extract standard messaging fields gracefully
      const phone = data.from || data.sender || data.phone || data.phoneNumber;
      let text = data.text?.body || data.body || data.text || data.message || '';
      const messageId = data.id || data.messageId || data.wamid;
      
      // Support interactive button replies (if WappBiz uses a standard structure)
      if (data.type === 'interactive' && data.interactive) {
         text = data.interactive.button_reply?.id || data.interactive.list_reply?.id || text;
      } else if (data.type === 'button' && data.button) {
         text = data.button.text || data.button.payload || text;
      }

      if (!text || !phone) continue;

      // Prevent processing the same WappBiz message twice in a short burst
      if (messageId) {
        if (processedMessageIds.has(messageId)) continue;
        processedMessageIds.add(messageId);
        // Keep the set from growing infinitely
        if (processedMessageIds.size > 1000) {
          const firstItem = processedMessageIds.values().next().value;
          if (firstItem) processedMessageIds.delete(firstItem);
        }
      }

      // Process message asynchronously
      processIncomingMessage(phone, text, 'wappbiz').catch(e => {
        console.error('Failed to process WappBiz message:', e);
      });
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('WappBiz webhook error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function GET(req: Request) {
  // Return OK for any generic webhook verification pings.
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get('hub.challenge') || searchParams.get('challenge');
  
  if (challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('WappBiz Webhook Endpoint Ready', { status: 200 });
}
