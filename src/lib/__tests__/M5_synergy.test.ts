import { describe, it, expect } from 'vitest';
import { buildSynergyReview, type SynergySide } from '../M5_synergy';

describe('M5_synergy', () => {
  const src: SynergySide = {
    intent: 'BUY_SIDE',
    sector: 'manufacturing',
    industry: 'industrial engineering and precision components',
    geography: 'Pune',
    dealMin: 100,
    dealMax: 250,
    revMin: null,
    revMax: null,
  };
  const cp: SynergySide = {
    intent: 'SELL_SIDE',
    sector: 'manufacturing',
    industry: 'industrial engineering and precision components',
    geography: 'Mumbai',
    dealMin: 100,
    dealMax: 200,
    revMin: null,
    revMax: null,
  };

  it('same-sector, overlapping size, same state, same industry', () => {
    const r = buildSynergyReview(src, cp, 76);
    expect(r.alignmentBand).toBe('High');
    expect(/same-sector|consolidation/i.test(r.sectorFit)).toBe(true);
    expect(/overlap/i.test(r.financialFit)).toBe(true);
    expect(/same region/i.test(r.geographyFit)).toBe(true);
    expect(r.industryNote).not.toBeNull();
    expect(/Both operate in/i.test(r.industryNote!)).toBe(true);
    expect(/\b\d{2,3}%|\b76\b/.test(r.comment)).toBe(false);
  });

  it('disjoint sizes, different regions', () => {
    const r2 = buildSynergyReview(
      { ...src, dealMin: 10, dealMax: 20, geography: 'Delhi' },
      { ...cp, dealMin: 100, dealMax: 200, geography: 'Chennai' },
      58,
    );
    expect(r2.alignmentBand).toBe('Exploratory');
    expect(/differ/i.test(r2.financialFit)).toBe(true);
    expect(/different regions/i.test(r2.geographyFit)).toBe(true);
  });

  it('identity safety: phone and email are stripped', () => {
    const r3 = buildSynergyReview(src, { ...cp, industry: 'auto-components' }, 65);
    expect(r3.alignmentBand).toBe('Moderate');
    expect(/@|\b\d{10}\b/.test(r3.comment + r3.sectorFit + r3.financialFit + (r3.industryNote ?? ''))).toBe(false);
    expect(r3.industryNote).not.toBeNull();
    expect(r3.industryNote!.includes('auto-components')).toBe(true);
  });

  it('sparse data does not crash', () => {
    const r4 = buildSynergyReview(
      { intent: 'BUY_SIDE', sector: null, industry: null, geography: null, dealMin: null, dealMax: null, revMin: null, revMax: null },
      { intent: 'SELL_SIDE', sector: null, industry: null, geography: null, dealMin: null, dealMax: null, revMin: null, revMax: null },
      50,
    );
    expect(r4.industryNote).toBeNull();
    expect(/not fully disclosed/i.test(r4.financialFit)).toBe(true);
    expect(/not disclosed/i.test(r4.geographyFit)).toBe(true);
  });
});