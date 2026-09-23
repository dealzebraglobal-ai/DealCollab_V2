import { describe, it, expect } from 'vitest';
import {
  applyHardRejections,
  calculateV2Score,
  buildCanonicalText,
  type ProposalInput,
  type Candidate,
} from '../matchmakingEngine';

// Minimal, valid ProposalInput/Candidate builders — every test below overrides only what it needs.
function proposal(overrides: Partial<ProposalInput>): ProposalInput {
  return {
    mandateId: 'm-1',
    userId: 'u-source',
    intent: 'BUY_SIDE',
    raw_text: 'test mandate',
    sector: 'pharma',
    industry: 'Pharmaceutical Formulations',
    sub_sector: null,
    serving_sectors: [],
    geography: 'Mumbai',
    deal_size: null,
    revenue: null,
    structure: null,
    intent_focus: null,
    industry_data: {},
    special_conditions: [],
    deal_size_min: null,
    deal_size_max: null,
    revenue_min: null,
    revenue_max: null,
    ...overrides,
  };
}

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    id: 'c-1',
    user_id: 'u-candidate',
    intent: 'SELL_SIDE',
    industry: 'Pharmaceutical Formulations',
    sectors: ['PHARMACEUTICALS'],
    serving_sectors: [],
    geographies: ['Mumbai'],
    deal_size_min_cr: null,
    deal_size_max_cr: null,
    revenue_min_cr: null,
    revenue_max_cr: null,
    deal_structure: null,
    normalised_text: 'pharmaceutical formulations company in Mumbai',
    similarity: 0.8,
    fraud_flags: null,
    quality_tier: 1,
    is_shell: false,
    buyer_type: null,
    inferred_buyer_type: null,
    advisor_name: null,
    contact_phone: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('Matchmaking engine — 20-scenario acceptance suite', () => {
  it('TEST 1: BUY_SIDE pharma vs SELL_SIDE pharma — MATCH', () => {
    const src = proposal({ intent: 'BUY_SIDE' });
    const cnd = candidate({ intent: 'SELL_SIDE' });
    expect(applyHardRejections(src, cnd).rejected).toBe(false);
    expect(calculateV2Score(src, cnd).finalScore).toBeGreaterThanOrEqual(60);
  });

  it('TEST 2: BUY_SIDE pharma vs SELL_SIDE real estate — REJECT', () => {
    const src = proposal({ intent: 'BUY_SIDE', sector: 'pharma', industry: 'Pharmaceutical Formulations' });
    const cnd = candidate({ intent: 'SELL_SIDE', industry: 'Commercial Real Estate', sectors: ['REAL_ESTATE'] });
    expect(applyHardRejections(src, cnd).rejected).toBe(true);
  });

  it('TEST 5: BUY_SIDE ₹20 Cr budget vs SELL_SIDE ₹80 Cr ask — allowed under 5x directional ceiling', () => {
    const src = proposal({ intent: 'BUY_SIDE', deal_size_min: '20', deal_size_max: '20' });
    const cnd = candidate({ intent: 'SELL_SIDE', deal_size_min_cr: 80, deal_size_max_cr: 80 });
    expect(applyHardRejections(src, cnd).rejected).toBe(false);
  });

  it('TEST 6: BUY_SIDE ₹20 Cr budget vs SELL_SIDE ₹150 Cr ask — rejected (exceeds 5x ceiling)', () => {
    const src = proposal({ intent: 'BUY_SIDE', deal_size_min: '20', deal_size_max: '20' });
    const cnd = candidate({ intent: 'SELL_SIDE', deal_size_min_cr: 150, deal_size_max_cr: 150 });
    const result = applyHardRejections(src, cnd);
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('HR-2');
  });

  it('TEST 7: FUNDRAISING company vs BUY_SIDE investor — MATCH', () => {
    const src = proposal({ intent: 'FUNDRAISING', structure: 'Minority growth equity', industry: 'AI / Data Analytics', sector: 'saas' });
    const cnd = candidate({ intent: 'BUY_SIDE', deal_structure: 'Growth equity investment', industry: 'AI / Data Analytics', sectors: ['TECHNOLOGY'] });
    expect(applyHardRejections(src, cnd).rejected).toBe(false);
  });

  it('TEST 8: FUNDRAISING company vs BUY_SIDE seeking only majority/100% acquisition — REJECT (HR-3)', () => {
    const src = proposal({ intent: 'FUNDRAISING', structure: 'Convertible debenture, minority stake' });
    const cnd = candidate({ intent: 'BUY_SIDE', deal_structure: '100% full buyout acquisition only' });
    const result = applyHardRejections(src, cnd);
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('HR-3');
  });

  it('HR-3 context-aware equity: "100% equity acquisition" counts as buyout, not fundraise-only', () => {
    // A source doing a genuine minority fundraise must still be rejected by a buyer explicitly
    // structured as "100% equity acquisition" — the word "equity" alone must not neutralise the
    // buyout keywords also present in the same string.
    const src = proposal({ intent: 'FUNDRAISING', structure: 'Minority convertible' });
    const cnd = candidate({ intent: 'BUY_SIDE', deal_structure: '100% equity acquisition' });
    const result = applyHardRejections(src, cnd);
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('HR-3');
  });

  it('TEST 9: Same industry, different Pune/Mumbai geography — still a strong match', () => {
    const src = proposal({ geography: 'Pune', industry: 'Pharmaceutical Formulations', sector: 'pharma' });
    const cnd = candidate({ geographies: ['Mumbai'], industry: 'Pharmaceutical Formulations', similarity: 0.85 });
    expect(applyHardRejections(src, cnd).rejected).toBe(false);
    expect(calculateV2Score(src, cnd).finalScore).toBeGreaterThanOrEqual(70);
  });

  it('TEST 10: Same Pune geography but incompatible industry — must NOT rank highly', () => {
    const src = proposal({ geography: 'Pune', industry: 'Pharmaceutical Formulations', sector: 'pharma' });
    const cnd = candidate({ geographies: ['Pune'], industry: 'Commercial Real Estate', sectors: ['REAL_ESTATE'], similarity: 0.6 });
    // Industry-incompatible pairs are hard-rejected outright — geography never rescues them.
    expect(applyHardRejections(src, cnd).rejected).toBe(true);
  });

  it('TEST 11: Missing deal size but matching revenue — financial score uses revenue overlap', () => {
    const src = proposal({ deal_size_min: null, deal_size_max: null, revenue_min: '10', revenue_max: '20' });
    const cnd = candidate({ deal_size_min_cr: null, deal_size_max_cr: null, revenue_min_cr: 12, revenue_max_cr: 18 });
    const score = calculateV2Score(src, cnd);
    expect(score.breakdown.financialScore).toBeGreaterThan(0.5);
  });

  it('TEST 12: Missing all financial data — candidate is not rejected, neutral financial score', () => {
    const src = proposal({ deal_size_min: null, deal_size_max: null, revenue_min: null, revenue_max: null });
    const cnd = candidate({ deal_size_min_cr: null, deal_size_max_cr: null, revenue_min_cr: null, revenue_max_cr: null });
    expect(applyHardRejections(src, cnd).rejected).toBe(false);
    expect(calculateV2Score(src, cnd).breakdown.financialScore).toBe(0.5);
  });

  it('malformed financial strings never produce NaN', () => {
    const src = proposal({ deal_size_min: 'not-a-number', deal_size_max: 'also bad' });
    const cnd = candidate({ deal_size_min_cr: 10, deal_size_max_cr: 20 });
    const score = calculateV2Score(src, cnd);
    expect(Number.isNaN(score.finalScore)).toBe(false);
    expect(Number.isNaN(score.breakdown.financialScore)).toBe(false);
  });

  it('TEST 13: Inactive candidate — rejected by HR-5 when status is present', () => {
    const src = proposal({});
    const cnd = candidate({ status: 'PAUSED' });
    const result = applyHardRejections(src, cnd);
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('HR-5');
  });

  it('TEST 14: Candidate with fraud flags — rejected by HR-8', () => {
    const src = proposal({});
    const cnd = candidate({ fraud_flags: ['guaranteed return'] });
    const result = applyHardRejections(src, cnd);
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('HR-8');
  });

  it('TEST 15: Shell candidate when shell query is false — rejected by HR-7', () => {
    const src = proposal({ is_shell_query: false });
    const cnd = candidate({ is_shell: true });
    const result = applyHardRejections(src, cnd);
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('HR-7');
  });

  it('TEST 19: General/weak industry fit with strong semantic similarity must not score as a false positive', () => {
    const src = proposal({ industry: 'Freshwater Aquaculture', sector: 'mixed', geography: 'Pune' });
    const cnd = candidate({
      industry: 'Unrelated Generic Business Services',
      sectors: ['GENERAL'],
      geographies: ['Pune'],
      similarity: 0.6, // strong-ish semantic score but below the 0.65 safeguard threshold
    });
    const score = calculateV2Score(src, cnd);
    expect(score.finalScore).toBeLessThan(60);
  });

  it('TEST 20: Cross-mandate isolation — scoring source A twice never leaks state that changes source B\'s result', () => {
    const srcA = proposal({ userId: 'user-A', industry: 'Pharmaceutical Formulations', geography: 'Mumbai' });
    const srcB = proposal({ userId: 'user-B', industry: 'Sheet Metal Fabrication', sector: 'manufacturing', geography: 'Chennai' });
    const cnd = candidate({ industry: 'Pharmaceutical Formulations', geographies: ['Mumbai'] });

    const scoreA1 = calculateV2Score(srcA, cnd).finalScore;
    calculateV2Score(srcB, candidate({ industry: 'Sheet Metal Fabrication', sectors: ['MANUFACTURING'], geographies: ['Chennai'] }));
    const scoreA2 = calculateV2Score(srcA, cnd).finalScore;

    expect(scoreA1).toBe(scoreA2); // no module-level state carried a B-run artifact into A's result
  });

  it('serving_sectors and buyer_type appear as explicit signals in the canonical embedding text', () => {
    const text = buildCanonicalText(proposal({
      serving_sectors: ['HEALTHCARE', 'PHARMACEUTICALS'],
      buyer_type: 'Strategic',
    }));
    expect(text).toContain('serves: HEALTHCARE, PHARMACEUTICALS');
    expect(text).toContain('buyer type: Strategic');
  });

  describe('Industrial Water Treatment acceptance case (service-level taxonomy)', () => {
    const acquirer = proposal({
      intent: 'BUY_SIDE',
      sector: null,
      industry: 'Industrial water-treatment solutions company',
      serving_sectors: ['ETP', 'STP', 'ZLD'],
      geography: 'Maharashtra',
      deal_size_min: '75',
      deal_size_max: '200',
    });

    it('matches a genuine water-treatment target strongly (exact service overlap, revenue inside range)', () => {
      const target = candidate({
        intent: 'SELL_SIDE',
        industry: 'Environmental / Water Treatment',
        sectors: ['WATER_TREATMENT'],
        serving_sectors: ['ETP', 'STP', 'ZLD'],
        geographies: ['Maharashtra'],
        deal_size_min_cr: 110,
        deal_size_max_cr: 110,
        similarity: 0.82,
      });
      expect(applyHardRejections(acquirer, target).rejected).toBe(false);
      const score = calculateV2Score(acquirer, target);
      expect(score.breakdown.industryScore).toBe(1.0);
      expect(score.breakdown.financialScore).toBeGreaterThanOrEqual(0.9); // ₹110 Cr sits inside ₹75–200 Cr
      expect(score.finalScore).toBeGreaterThanOrEqual(75);
    });

    it('does NOT strongly match an IT services company merely because revenue and geography also line up', () => {
      const offTarget = candidate({
        intent: 'SELL_SIDE',
        industry: 'IT Services',
        sectors: ['TECHNOLOGY'],
        geographies: ['Maharashtra'],
        deal_size_min_cr: 110,
        deal_size_max_cr: 110,
        similarity: 0.55, // plausible generic semantic similarity, not a strong signal on its own
      });
      const score = calculateV2Score(acquirer, offTarget);
      expect(score.finalScore).toBeLessThan(60);
    });
  });

  describe('Financial range overlap — point values (the common real-world case)', () => {
    it('a candidate point value squarely inside a wide requirement range scores near 1.0, not ~0', () => {
      const src = proposal({ deal_size_min: '75', deal_size_max: '200' });
      const cnd = candidate({ deal_size_min_cr: 110, deal_size_max_cr: 110 });
      expect(calculateV2Score(src, cnd).breakdown.financialScore).toBeGreaterThanOrEqual(0.9);
    });

    it('a candidate point value far below the requirement range scores low', () => {
      const src = proposal({ deal_size_min: '75', deal_size_max: '200' });
      const cnd = candidate({ deal_size_min_cr: 5, deal_size_max_cr: 5 });
      expect(calculateV2Score(src, cnd).breakdown.financialScore).toBeLessThan(0.3);
    });

    it('a candidate point value far above the requirement range scores low', () => {
      const src = proposal({ deal_size_min: '75', deal_size_max: '200' });
      const cnd = candidate({ deal_size_min_cr: 500, deal_size_max_cr: 500 });
      expect(calculateV2Score(src, cnd).breakdown.financialScore).toBeLessThan(0.3);
    });

    it('two identical point values score exactly 1.0', () => {
      const src = proposal({ deal_size_min: '110', deal_size_max: '110' });
      const cnd = candidate({ deal_size_min_cr: 110, deal_size_max_cr: 110 });
      expect(calculateV2Score(src, cnd).breakdown.financialScore).toBe(1.0);
    });
  });

  describe('Production regression: "industrial water-treatment solutions" false-positive (2026-09-23)', () => {
    // Exact field shape pulled from the live proposals table for the reported bug: a BUY_SIDE
    // mandate whose sector is the coarse GENERAL fallback (industry captured only as free text)
    // was matching a generic MANUFACTURING candidate at 66-67%, labelled "Strong mandate
    // alignment" — driven entirely by shared boilerplate wording (both texts mention
    // "industrial"/"manufacturing"/acquisition language) with no real industry evidence.
    const waterTreatmentBuyer = proposal({
      intent: 'BUY_SIDE',
      sector: null, // stored as 'GENERAL' in production — industry is the only real signal
      industry: 'industrial water-treatment solutions',
      geography: 'Maharashtra, Gujarat, Karnataka',
      deal_size_min: '100',
      deal_size_max: '100',
      structure: 'Full Buyout',
    });

    it('a wildly oversized generic-manufacturing candidate is hard-rejected on deal size (HR-2), never scored', () => {
      // The exact production candidate: ₹340-2000 Cr ask against a ₹100 Cr budget.
      const oversizedManufacturer = candidate({
        intent: 'SELL_SIDE',
        industry: 'MANUFACTURING',
        sectors: ['MANUFACTURING'],
        geographies: ['Maharashtra'],
        deal_size_min_cr: 340,
        deal_size_max_cr: 2000,
        similarity: 0.76,
      });
      const result = applyHardRejections(waterTreatmentBuyer, oversizedManufacturer);
      expect(result.rejected).toBe(true);
      expect(result.reason).toContain('HR-2');
    });

    it('a size-compatible but industry-unrelated generic manufacturer never reaches a "Strong mandate alignment" claim', () => {
      // Same shape, but within budget this time — isolates the industry-gate/match-reason fix
      // from the deal-size fix so this specific regression can't silently start passing only
      // because HR-2 rejects it for an unrelated reason.
      const genericManufacturer = candidate({
        intent: 'SELL_SIDE',
        industry: 'MANUFACTURING',
        sectors: ['MANUFACTURING'],
        geographies: ['Maharashtra'],
        deal_size_min_cr: 90,
        deal_size_max_cr: 110,
        similarity: 0.76, // realistic: high due to shared boilerplate, not real industry match
      });
      expect(applyHardRejections(waterTreatmentBuyer, genericManufacturer).rejected).toBe(false);
      const score = calculateV2Score(waterTreatmentBuyer, genericManufacturer);
      expect(score.matchReason).not.toContain('Strong mandate alignment');
      expect(score.matchReason).toMatch(/no confirmed .*evidence/i);
      expect(score.finalScore).toBeLessThan(75); // must not read as "High" confidence
    });
  });
});
