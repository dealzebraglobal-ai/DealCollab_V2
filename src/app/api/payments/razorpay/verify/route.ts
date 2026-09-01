import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { verifyPaymentSignature } from '@/lib/razorpay';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Called from the client immediately after Razorpay Checkout's success
 * callback — this is a FAST PATH for UX, not the source of truth. The
 * webhook (api/webhooks/razorpay) is the authoritative confirmation and
 * calls the exact same capture_token_purchase RPC, which is why that RPC
 * is idempotent: whichever of the two arrives first actually credits
 * tokens, and the second is a documented no-op.
 *
 * The frontend's "payment succeeded" claim is never trusted on its own —
 * every value here is re-verified against Razorpay's own cryptographic
 * signature and the internal payment_transactions row before anything is
 * credited.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(`verify-payment:user:${session.user.email}`, 20, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many attempts — please wait before trying again' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const { paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = body as {
      paymentId?: string;
      razorpayOrderId?: string;
      razorpayPaymentId?: string;
      razorpaySignature?: string;
    };

    if (!paymentId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json({ success: false, error: 'Missing payment verification fields' }, { status: 400 });
    }

    // Official Razorpay signature check — the ONLY thing that proves this
    // callback is real, not a forged "success" claim from the browser.
    const validSignature = verifyPaymentSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });
    if (!validSignature) {
      console.error('[verify] Invalid Razorpay signature for payment', paymentId);
      return NextResponse.json({ success: false, error: 'Payment verification failed' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase init failed');

    const { data: dbUser } = await supabase.from('users').select('id').eq('email', session.user.email).single();
    if (!dbUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Confirm the internal payment row matches: same user, same order —
    // an authenticated attacker cannot verify someone ELSE's order by
    // supplying its id, since ownership is checked here, not assumed from
    // the signature alone (the signature only proves the order/payment
    // pair is real, not that the caller is entitled to it).
    const { data: payment } = await supabase
      .from('payment_transactions')
      .select('id, user_id, razorpay_order_id, status')
      .eq('id', paymentId)
      .maybeSingle();

    if (!payment || payment.user_id !== dbUser.id || payment.razorpay_order_id !== razorpayOrderId) {
      console.error('[verify] Payment/order/user mismatch for payment', paymentId);
      return NextResponse.json({ success: false, error: 'Payment verification failed' }, { status: 400 });
    }

    const { data: rpcResult, error: rpcErr } = await supabase.rpc('capture_token_purchase', {
      p_payment_id: paymentId,
      p_razorpay_payment_id: razorpayPaymentId,
    });

    if (rpcErr) {
      console.error('[verify] capture_token_purchase RPC error:', rpcErr);
      return NextResponse.json({ success: false, error: 'Unable to complete payment' }, { status: 500 });
    }

    const r = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    if (!r?.success) {
      return NextResponse.json({ success: false, error: r?.message || 'Unable to complete payment' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      alreadyProcessed: r.error_code === 'ALREADY_PROCESSED',
      newBalance: r.new_balance,
      tokensCredited: r.token_quantity,
    });
  } catch (err) {
    console.error('[payments/razorpay/verify] error:', err);
    return NextResponse.json({ success: false, error: 'Unable to complete payment' }, { status: 500 });
  }
}
