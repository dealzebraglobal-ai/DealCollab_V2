import crypto from 'crypto';

/**
 * DealCollab — Razorpay server-side client
 * ===========================================
 * Implemented via Razorpay's plain REST API + Node's built-in crypto,
 * matching this codebase's existing convention for external providers
 * (Brevo, WappBiz) — a small, fully-auditable fetch wrapper rather than
 * pulling in the official `razorpay` npm SDK, which is a thin wrapper
 * around the same REST endpoints anyway. No new dependency added.
 *
 * SECURITY: RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are read from
 * server-only env vars and never logged, never returned to the client, and
 * never referenced from a NEXT_PUBLIC_* variable. Only
 * NEXT_PUBLIC_RAZORPAY_KEY_ID (the publishable key, safe by design) reaches
 * the browser, via the Checkout script in the payment UI.
 */

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';
const REQUEST_TIMEOUT_MS = 15_000;

function getCredentials(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  return { keyId, keySecret };
}

interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/**
 * Creates a Razorpay order. `amountPaise` and `currency` must already be
 * server-calculated (package price minus any validated discount) — never
 * pass a client-supplied amount here.
 */
export async function createRazorpayOrder(params: {
  amountPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const { keyId, keySecret } = getCredentials();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${RAZORPAY_API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: Math.round(params.amountPaise),
        currency: params.currency,
        receipt: params.receipt,
        notes: params.notes || {},
      }),
      signal: controller.signal,
    });

    const bodyText = await res.text();
    if (!res.ok) {
      console.error(`[razorpay] createOrder failed (${res.status}):`, bodyText.slice(0, 300));
      throw new Error('Unable to create payment order. Please try again.');
    }

    return JSON.parse(bodyText) as RazorpayOrder;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Payment order creation timed out. Please try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Official Razorpay payment-verification signature check (documented
 * algorithm: HMAC-SHA256 of `order_id|payment_id` using the key secret).
 * This is the only thing that proves a checkout callback is real — never
 * trust a frontend "success" flag on its own.
 */
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = getCredentials();
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(params.signature);
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Official Razorpay webhook-verification signature check (documented
 * algorithm: HMAC-SHA256 of the RAW request body using the webhook secret
 * — a separate secret from the API key, configured in the Razorpay
 * dashboard's webhook settings). Must be computed against the exact raw
 * bytes, before any JSON.parse.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[razorpay webhook] RAZORPAY_WEBHOOK_SECRET not configured — rejecting all requests.');
    return false;
  }
  if (!signatureHeader) return false;

  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('hex');

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
