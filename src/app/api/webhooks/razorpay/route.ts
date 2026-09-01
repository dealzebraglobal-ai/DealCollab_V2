import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { verifyWebhookSignature } from '@/lib/razorpay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Razorpay webhook — the SOURCE OF TRUTH for payment confirmation (the
 * client-side verify route at api/payments/razorpay/verify is a fast-path
 * for UX; this is what actually must be trusted, since it comes directly
 * from Razorpay's servers rather than through the user's browser).
 *
 * Signature is verified against the RAW request body using
 * RAZORPAY_WEBHOOK_SECRET — a separate secret from the API key, configured
 * in the Razorpay dashboard's webhook settings, and never derived from or
 * substitutable with anything the client controls (URL, payment id, etc.).
 *
 * Idempotent by construction: this calls the exact same
 * capture_token_purchase RPC the verify route calls, which checks the
 * payment's current status under a row lock before crediting anything —
 * calling it twice (once from verify, once from here, or twice from a
 * Razorpay retry) is always safe.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();

  if (!verifyWebhookSignature(rawBody, req.headers.get('x-razorpay-signature'))) {
    console.error('[razorpay webhook] Invalid or missing signature — rejecting request.');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string; notes?: Record<string, string> } } };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log('[razorpay webhook] Event received:', payload.event);

  // Only payment.captured actually credits tokens. Every other event
  // (order.paid, payment.failed, refund.*, etc.) is acknowledged but not
  // acted on — this app doesn't implement refund token clawback (Phase 22:
  // no business rule defined yet), so a refund event is deliberately a
  // no-op here rather than an invented behavior.
  if (payload.event !== 'payment.captured') {
    return NextResponse.json({ status: 'ignored' }, { status: 200 });
  }

  const entity = payload.payload?.payment?.entity;
  const razorpayPaymentId = entity?.id;
  const razorpayOrderId = entity?.order_id;

  if (!razorpayPaymentId || !razorpayOrderId) {
    console.error('[razorpay webhook] payment.captured missing payment/order id');
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase init failed');

    // Match to OUR internal record by razorpay_order_id — never credit
    // tokens simply because a webhook says a payment id exists; it must
    // correspond to a payment_transactions row we created ourselves.
    const { data: payment } = await supabase
      .from('payment_transactions')
      .select('id')
      .eq('razorpay_order_id', razorpayOrderId)
      .maybeSingle();

    if (!payment) {
      console.error('[razorpay webhook] No matching payment_transactions row for order', razorpayOrderId);
      // Acknowledge anyway — this could be an order from a different
      // integration/environment; returning a non-2xx would make Razorpay
      // retry indefinitely for something we can never resolve.
      return NextResponse.json({ status: 'no_matching_order' }, { status: 200 });
    }

    const { data: rpcResult, error: rpcErr } = await supabase.rpc('capture_token_purchase', {
      p_payment_id: payment.id,
      p_razorpay_payment_id: razorpayPaymentId,
    });

    if (rpcErr) {
      console.error('[razorpay webhook] capture_token_purchase RPC error:', rpcErr);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }

    const r = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    console.log('[razorpay webhook] Capture result:', r?.error_code);

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (err) {
    console.error('[razorpay webhook] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
