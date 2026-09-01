import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { createRazorpayOrder } from '@/lib/razorpay';
import { checkPromoEligibility, calculateDiscount, type PromoRow } from '@/lib/promoCode';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Creates a Razorpay order (or, for a 100%-discount promo, redeems it
 * directly with no Razorpay order at all — Phase 17). Every value that
 * matters (package price, discount, final amount, token quantity) is
 * looked up / computed server-side from packageId and promoCode alone —
 * the request body never carries a price, amount, or token count.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(`create-order:user:${session.user.email}`, 10, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many attempts — please wait before trying again' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const { packageId, promoCode } = body as { packageId?: string; promoCode?: string };

    if (!packageId || typeof packageId !== 'string') {
      return NextResponse.json({ success: false, error: 'packageId is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase init failed');

    const { data: dbUser } = await supabase.from('users').select('id').eq('email', session.user.email).single();
    if (!dbUser) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const { data: pkg } = await supabase
      .from('token_packages')
      .select('id, tokens, price_paise, currency')
      .eq('id', packageId)
      .eq('active', true)
      .maybeSingle();

    if (!pkg) {
      return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });
    }

    let promoRowId: string | null = null;
    let finalAmountPaise = pkg.price_paise;
    let discountAmountPaise = 0;
    let tokenBonus = 0;

    if (promoCode && typeof promoCode === 'string') {
      const { data: promoData } = await supabase
        .from('promocodes')
        .select('*')
        .ilike('code', promoCode.trim())
        .maybeSingle();

      if (!promoData) {
        return NextResponse.json({ success: false, error: 'Invalid promo code' }, { status: 400 });
      }

      const promo: PromoRow = {
        id: promoData.id,
        code: promoData.code,
        discountType: promoData.discount_type,
        discountValue: Number(promoData.discount_value),
        tokenBonus: promoData.token_bonus,
        startAt: promoData.start_at ? new Date(promoData.start_at) : null,
        expiresAt: promoData.expires_at ? new Date(promoData.expires_at) : null,
        maxTotalUses: promoData.max_total_uses,
        maxUsesPerUser: promoData.max_uses_per_user,
        minimumPurchaseAmountPaise: Number(promoData.minimum_purchase_amount_paise),
        active: promoData.active,
        applicablePackageIds: promoData.applicable_package_ids,
      };

      const eligibility = checkPromoEligibility(promo, { packageId, originalAmountPaise: pkg.price_paise });
      if (!eligibility.eligible) {
        return NextResponse.json({ success: false, error: `Promo code is ${eligibility.reason.toLowerCase().replace('_', ' ')}` }, { status: 400 });
      }

      const discount = calculateDiscount(promo, pkg.price_paise);
      finalAmountPaise = discount.finalAmountPaise;
      discountAmountPaise = discount.discountAmountPaise;
      tokenBonus = discount.tokenBonus;
      promoRowId = promo.id;

      // Phase 17 — a 100%-discount promo (or a pure TOKEN_BONUS code, which
      // never touches price) skips Razorpay entirely.
      if (finalAmountPaise === 0) {
        const { data: rpcResult, error: rpcErr } = await supabase.rpc('redeem_free_promo', {
          p_user_id: dbUser.id,
          p_promo_code_id: promoRowId,
          p_package_id: packageId,
        });
        if (rpcErr) {
          console.error('[create-order] redeem_free_promo RPC error:', rpcErr);
          return NextResponse.json({ success: false, error: 'Unable to redeem promo code' }, { status: 500 });
        }
        const r = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
        if (!r?.success) {
          return NextResponse.json({ success: false, error: r?.message || 'Unable to redeem promo code' }, { status: 400 });
        }
        return NextResponse.json({
          success: true,
          free: true,
          newBalance: r.new_balance,
          paymentId: r.payment_id,
        });
      }
    }

    const totalTokens = pkg.tokens + tokenBonus;

    const { data: paymentRow, error: insertErr } = await supabase
      .from('payment_transactions')
      .insert([{
        user_id: dbUser.id,
        package_id: packageId,
        amount_paise: finalAmountPaise,
        original_amount_paise: pkg.price_paise,
        discount_amount_paise: discountAmountPaise,
        currency: pkg.currency,
        token_quantity: totalTokens,
        promo_code_id: promoRowId,
        status: 'CREATED',
      }])
      .select('id')
      .single();

    if (insertErr || !paymentRow) {
      console.error('[create-order] Failed to create payment_transactions row:', insertErr);
      return NextResponse.json({ success: false, error: 'Unable to start payment' }, { status: 500 });
    }

    let order;
    try {
      order = await createRazorpayOrder({
        amountPaise: finalAmountPaise,
        currency: pkg.currency,
        receipt: paymentRow.id,
        notes: { userId: dbUser.id, packageId },
      });
    } catch (razorpayErr) {
      console.error('[create-order] Razorpay order creation failed:', razorpayErr);
      await supabase.from('payment_transactions').update({ status: 'FAILED' }).eq('id', paymentRow.id);
      return NextResponse.json({ success: false, error: 'Unable to create payment order. Please try again.' }, { status: 502 });
    }

    await supabase.from('payment_transactions').update({ razorpay_order_id: order.id }).eq('id', paymentRow.id);

    return NextResponse.json({
      success: true,
      free: false,
      orderId: order.id,
      amountPaise: finalAmountPaise,
      currency: pkg.currency,
      paymentId: paymentRow.id,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('[payments/razorpay/create-order] error:', err);
    return NextResponse.json({ success: false, error: 'Unable to create payment order' }, { status: 500 });
  }
}
