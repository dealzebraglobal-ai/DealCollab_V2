/**
 * DealCollab — promo code discount calculation
 * ===============================================
 * Pure functions only — no DB access, no side effects. Server-side
 * validation of eligibility (expiry, usage limits, per-user limits) is
 * enforced in two places by design: here for a fast display-only check,
 * and again — authoritatively, under a row lock — inside the
 * redeem_free_promo / capture_token_purchase Postgres RPCs, which is what
 * actually closes the race-condition window. This module never decides
 * whether a code "can" be used against the database; it only computes
 * what the discount WOULD be for a code that passed those checks.
 */

export type PromoRow = {
  id: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'TOKEN_BONUS';
  discountValue: number; // percent (0-100) for PERCENTAGE, paise for FIXED_AMOUNT, unused for TOKEN_BONUS
  tokenBonus: number | null;
  startAt: Date | null;
  expiresAt: Date | null;
  maxTotalUses: number | null;
  maxUsesPerUser: number;
  minimumPurchaseAmountPaise: number;
  active: boolean;
  applicablePackageIds: string[] | null;
};

export type PromoEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: 'INACTIVE' | 'NOT_STARTED' | 'EXPIRED' | 'NOT_APPLICABLE' | 'BELOW_MINIMUM' };

/**
 * Time/config-only eligibility — does NOT check usage counts (that
 * requires a DB read under lock, done in the RPCs). Used for the fast
 * "is this code even worth attempting" pre-check in the validate route.
 */
export function checkPromoEligibility(
  promo: PromoRow,
  params: { packageId: string; originalAmountPaise: number; now?: Date },
): PromoEligibilityResult {
  const now = params.now ?? new Date();

  if (!promo.active) return { eligible: false, reason: 'INACTIVE' };
  if (promo.startAt && now < promo.startAt) return { eligible: false, reason: 'NOT_STARTED' };
  if (promo.expiresAt && now > promo.expiresAt) return { eligible: false, reason: 'EXPIRED' };
  if (promo.applicablePackageIds && !promo.applicablePackageIds.includes(params.packageId)) {
    return { eligible: false, reason: 'NOT_APPLICABLE' };
  }
  if (params.originalAmountPaise < promo.minimumPurchaseAmountPaise) {
    return { eligible: false, reason: 'BELOW_MINIMUM' };
  }

  return { eligible: true };
}

export interface DiscountCalculation {
  originalAmountPaise: number;
  discountAmountPaise: number;
  finalAmountPaise: number;
  tokenBonus: number;
}

/**
 * Computes the discount for an ALREADY-eligible promo. Discount is capped
 * at the original amount — a promo can make a purchase free, never
 * negative (Phase 14: "Do not allow negative prices").
 */
export function calculateDiscount(promo: PromoRow, originalAmountPaise: number): DiscountCalculation {
  let discountAmountPaise = 0;
  let tokenBonus = 0;

  switch (promo.discountType) {
    case 'PERCENTAGE': {
      const pct = Math.min(Math.max(promo.discountValue, 0), 100);
      discountAmountPaise = Math.round((originalAmountPaise * pct) / 100);
      break;
    }
    case 'FIXED_AMOUNT': {
      discountAmountPaise = Math.round(promo.discountValue);
      break;
    }
    case 'TOKEN_BONUS': {
      tokenBonus = promo.tokenBonus ?? 0;
      break;
    }
  }

  // Never let a discount exceed the amount being charged, and never go negative.
  discountAmountPaise = Math.min(Math.max(discountAmountPaise, 0), originalAmountPaise);
  const finalAmountPaise = originalAmountPaise - discountAmountPaise;

  return { originalAmountPaise, discountAmountPaise, finalAmountPaise, tokenBonus };
}
