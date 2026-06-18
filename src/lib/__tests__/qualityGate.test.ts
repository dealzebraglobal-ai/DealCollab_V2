import { describe, it, expect } from 'vitest';
import { computeQualityGate } from '../qualityGate';
import { baseState } from './_helpers';

describe('computeQualityGate — pass/fail thresholds', () => {
  it('no intent → score 0, fails, asks for intent', () => {
    const r = computeQualityGate(baseState());
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.missing[0]).toMatch(/buy, sell, raise/i);
  });

  it('SELL_SIDE: sector + geography + revenue → 7, passes', () => {
    const r = computeQualityGate(baseState({
      intent: 'SELL_SIDE', sector: 'pharma', geography: 'Mumbai', revenue: '₹50 Cr',
    }));
    expect(r.score).toBe(7);
    expect(r.passed).toBe(true);
  });

  it('SELL_SIDE: missing geography is a HARD fail even if other points exist', () => {
    const r = computeQualityGate(baseState({
      intent: 'SELL_SIDE', sector: 'pharma', revenue: '₹50 Cr', structure: 'full sale', sub_sector: 'API',
    }));
    expect(r.passed).toBe(false);
    expect(r.missing).toContain('city, state, or region');
  });

  it('BUY_SIDE: sector + geography + deal_size → 6, passes', () => {
    const r = computeQualityGate(baseState({
      intent: 'BUY_SIDE', sector: 'saas', geography: 'India', deal_size: '₹100 Cr',
    }));
    expect(r.score).toBe(6);
    expect(r.passed).toBe(true);
  });

  it('BUY_SIDE: missing deal_size is a HARD fail', () => {
    const r = computeQualityGate(baseState({
      intent: 'BUY_SIDE', sector: 'saas', geography: 'India', intent_focus: 'market entry',
    }));
    expect(r.passed).toBe(false);
    expect(r.missing).toContain('approximate budget or ticket size');
  });

  it('FUNDRAISING: sector + deal_size → 5, passes', () => {
    const r = computeQualityGate(baseState({
      intent: 'FUNDRAISING', sector: 'consumer', deal_size: '₹20 Cr',
    }));
    expect(r.score).toBe(5);
    expect(r.passed).toBe(true);
  });

  it('DEBT: sector + deal_size + intent_focus → 7, passes', () => {
    const r = computeQualityGate(baseState({
      intent: 'DEBT', sector: 'manufacturing', deal_size: '₹30 Cr', intent_focus: 'capex',
    }));
    expect(r.score).toBe(7);
    expect(r.passed).toBe(true);
  });

  it('STRATEGIC_PARTNERSHIP: sector + geography + intent_focus → 7, passes', () => {
    const r = computeQualityGate(baseState({
      intent: 'STRATEGIC_PARTNERSHIP', sector: 'logistics', geography: 'Pune', intent_focus: 'distribution tie-up',
    }));
    expect(r.score).toBe(7);
    expect(r.passed).toBe(true);
  });
});
