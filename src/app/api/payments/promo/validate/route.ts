import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import { checkPromoEligibility, calculateDiscount, type PromoRow } from '@/lib/promoCode';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Display-only validation — never trusted for the actual charge. The final
 * amount is recalculated again, from scratch, when the Razorpay order is
 * created (create-order/route.ts) and once more inside the atomic RPC at
 * capture time. This route exists purely so the UI can show a discount
 * before the user commits to checkout.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(`promo-validate:user:${session.user.email}`, 20, 5 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many attempts — please wait before trying again' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const { packageId, promoCode } = body as { packageId?: string; promoCode?: string };

    if (!packageId || typeof packageId !== 'string') {
      return NextResponse.json({ success: false, error: 'packageId is required' }, { status: 400 });
    }
    if (!promoCode || typeof promoCode !== 'string') {
      return NextResponse.json({ success: false, error: 'promoCode is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new Error('Supabase init failed');

    const { data: pkg } = await supabase
      .from('token_packages')
      .select('id, tokens, price_paise, currency')
      .eq('id', packageId)
      .eq('active', true)
      .maybeSingle();

    if (!pkg) {
      return NextResponse.json({ success: false, valid: false, error: 'Package not found' }, { status: 404 });
    }

    const { data: promoData } = await supabase
      .from('promocodes')
      .select('*')
      .ilike('code', promoCode.trim())
      .maybeSingle();

    if (!promoData) {
      return NextResponse.json({ success: true, valid: false, error: 'Invalid promo code' });
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
      return NextResponse.json({ success: true, valid: false, error: `Promo code is ${eligibility.reason.toLowerCase().replace('_', ' ')}` });
    }

    // Usage-limit pre-check (display only — the RPC re-checks this under a
    // row lock at actual redemption time, which is the real guarantee).
    const { count: totalUses } = await supabase
      .from('promo_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('promo_code_id', promo.id);
    if (promo.maxTotalUses !== null && (totalUses ?? 0) >= promo.maxTotalUses) {
      return NextResponse.json({ success: true, valid: false, error: 'Promo code usage limit reached' });
    }

    const { data: dbUser } = await supabase.from('users').select('id').eq('email', session.user.email).single();
    if (dbUser) {
      const { count: userUses } = await supabase
        .from('promo_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('promo_code_id', promo.id)
        .eq('user_id', dbUser.id);
      if ((userUses ?? 0) >= promo.maxUsesPerUser) {
        return NextResponse.json({ success: true, valid: false, error: 'You have already used this promo code' });
      }
    }

    const discount = calculateDiscount(promo, pkg.price_paise);

    return NextResponse.json({
      success: true,
      valid: true,
      originalAmountInr: discount.originalAmountPaise / 100,
      discountAmountInr: discount.discountAmountPaise / 100,
      finalAmountInr: discount.finalAmountPaise / 100,
      tokenBonus: discount.tokenBonus,
    });
  } catch (err) {
    console.error('[payments/promo/validate] error:', err);
    return NextResponse.json({ success: false, error: 'Unable to validate promo code' }, { status: 500 });
  }
}
