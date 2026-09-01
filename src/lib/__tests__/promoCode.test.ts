import { describe, it, expect } from 'vitest';
import { checkPromoEligibility, calculateDiscount, type PromoRow } from '../promoCode';

function makePromo(overrides: Partial<PromoRow> = {}): PromoRow {
  return {
    id: 'promo-1',
    code: 'TESTCODE',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    tokenBonus: null,
    startAt: null,
    expiresAt: null,
    maxTotalUses: null,
    maxUsesPerUser: 1,
    minimumPurchaseAmountPaise: 0,
    active: true,
    applicablePackageIds: null,
    ...overrides,
  };
}

describe('checkPromoEligibility', () => {
  it('is eligible when active, unexpired, and applicable', () => {
    const result = checkPromoEligibility(makePromo(), { packageId: 'starter', originalAmountPaise: 100000 });
    expect(result.eligible).toBe(true);
  });

  it('rejects an inactive code', () => {
    const result = checkPromoEligibility(makePromo({ active: false }), { packageId: 'starter', originalAmountPaise: 100000 });
    expect(result).toEqual({ eligible: false, reason: 'INACTIVE' });
  });

  it('rejects a code that has not started yet', () => {
    const future = new Date(Date.now() + 86_400_000);
    const result = checkPromoEligibility(makePromo({ startAt: future }), { packageId: 'starter', originalAmountPaise: 100000 });
    expect(result).toEqual({ eligible: false, reason: 'NOT_STARTED' });
  });

  it('rejects an expired code', () => {
    const past = new Date(Date.now() - 86_400_000);
    const result = checkPromoEligibility(makePromo({ expiresAt: past }), { packageId: 'starter', originalAmountPaise: 100000 });
    expect(result).toEqual({ eligible: false, reason: 'EXPIRED' });
  });

  it('rejects a code not applicable to the selected package', () => {
    const result = checkPromoEligibility(
      makePromo({ applicablePackageIds: ['growth'] }),
      { packageId: 'starter', originalAmountPaise: 100000 },
    );
    expect(result).toEqual({ eligible: false, reason: 'NOT_APPLICABLE' });
  });

  it('rejects a purchase below the minimum amount', () => {
    const result = checkPromoEligibility(
      makePromo({ minimumPurchaseAmountPaise: 200000 }),
      { packageId: 'starter', originalAmountPaise: 100000 },
    );
    expect(result).toEqual({ eligible: false, reason: 'BELOW_MINIMUM' });
  });
});

describe('calculateDiscount', () => {
  it('calculates a percentage discount correctly', () => {
    const result = calculateDiscount(makePromo({ discountType: 'PERCENTAGE', discountValue: 10 }), 100000);
    expect(result.discountAmountPaise).toBe(10000);
    expect(result.finalAmountPaise).toBe(90000);
  });

  it('calculates a fixed-amount discount correctly', () => {
    const result = calculateDiscount(makePromo({ discountType: 'FIXED_AMOUNT', discountValue: 5000 }), 100000);
    expect(result.discountAmountPaise).toBe(5000);
    expect(result.finalAmountPaise).toBe(95000);
  });

  it('caps a fixed-amount discount at the original price — never a negative final amount', () => {
    const result = calculateDiscount(makePromo({ discountType: 'FIXED_AMOUNT', discountValue: 500000 }), 100000);
    expect(result.discountAmountPaise).toBe(100000);
    expect(result.finalAmountPaise).toBe(0);
  });

  it('caps a percentage discount at 100% even if a bad value is stored', () => {
    const result = calculateDiscount(makePromo({ discountType: 'PERCENTAGE', discountValue: 150 }), 100000);
    expect(result.discountAmountPaise).toBe(100000);
    expect(result.finalAmountPaise).toBe(0);
  });

  it('never produces a negative discount for a negative stored value', () => {
    const result = calculateDiscount(makePromo({ discountType: 'PERCENTAGE', discountValue: -50 }), 100000);
    expect(result.discountAmountPaise).toBe(0);
    expect(result.finalAmountPaise).toBe(100000);
  });

  it('a TOKEN_BONUS type applies no price discount, only a token bonus', () => {
    const result = calculateDiscount(makePromo({ discountType: 'TOKEN_BONUS', tokenBonus: 50 }), 100000);
    expect(result.discountAmountPaise).toBe(0);
    expect(result.finalAmountPaise).toBe(100000);
    expect(result.tokenBonus).toBe(50);
  });

  it('a 100% percentage discount produces a free (zero) final amount', () => {
    const result = calculateDiscount(makePromo({ discountType: 'PERCENTAGE', discountValue: 100 }), 249900);
    expect(result.finalAmountPaise).toBe(0);
  });
});
