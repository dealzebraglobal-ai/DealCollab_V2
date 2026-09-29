import { describe, it, expect } from 'vitest';
import {
  applyHardRejections,
  calculateV2Score,
  buildCanonicalText,
  type ProposalInput,
  type Candidate,
} from '../matchmakingEngine';
import { resolveIndustryCompatibility, getSectorCompatibility } from '../M5_sectorMatrix';

describe('Matchmaking Engine Regression Suite — Pune AI/Analytics Fundraise (Step 8)', () => {
  const baseAiFundraise: ProposalInput = {
    userId: 'user-source-001',
    intent: 'FUNDRAISING',
    industry: 'AI/data analytics',
    sector: 'saas',
    sub_sector: 'machine_learning',
    geography: 'Pune',
    deal_size: '₹5 Cr',
    revenue: '₹2 Cr',
    structure: 'convertible debenture',
    deal_structure: 'convertible debenture',
    deal_size_min: '5',
    deal_size_max: '5',
    revenue_min: '2',
    revenue_max: '2',
    raw_text: 'Raising ₹5 Cr growth round via convertible debentures for Pune-based enterprise AI and data analytics platform.',
    special_conditions: [],
  };

  it('1. REJECTS unrelated manufacturing acquisition buyer mandate (HR-4 / HR-3)', () => {
    const manufacturingAcquisitionCandidate: Candidate = {
      id: 'cand-mfg-001',
      user_id: 'user-cand-001',
      intent: 'BUY_SIDE',
      industry: 'Precision Plastic Molding & Manufacturing',
      sectors: ['MANUFACTURING'],
      serving_sectors: ['Automotive'],
      geographies: ['Pune'],
      deal_size_min_cr: 5,
      deal_size_max_cr: 10,
      revenue_min_cr: 10,
      revenue_max_cr: 30,
      deal_structure: '100% full buyout',
      buyer_type: 'Strategic Corporate Buyer',
      inferred_buyer_type: 'Strategic',
      normalised_text: 'BUY_SIDE | MANUFACTURING | Pune | 100% full buyout',
      similarity: 0.32,
      advisor_name: null,
      contact_phone: null,
      fraud_flags: [],
      quality_tier: 1,
      created_at: new Date().toISOString(),
    };

    const hrResult = applyHardRejections(baseAiFundraise, manufacturingAcquisitionCandidate);
    expect(hrResult.rejected).toBe(true);
    // Either HR-3 (buyout vs convertible debenture) or HR-4 (manufacturing vs ai)
    expect(hrResult.reason).toMatch(/HR-3|HR-4/);
  });

  it('2. REJECTS 100% majority buyout buyer for a convertible debenture fundraise (HR-3)', () => {
    const fullBuyoutTechBuyer: Candidate = {
      id: 'cand-buyout-002',
      user_id: 'user-cand-002',
      intent: 'BUY_SIDE',
      industry: 'Enterprise Software',
      sectors: ['TECHNOLOGY'],
      serving_sectors: [],
      geographies: ['Pune'],
      deal_size_min_cr: 5,
      deal_size_max_cr: 10,
      revenue_min_cr: 5,
      revenue_max_cr: 20,
      deal_structure: '100% Full Acquisition',
      buyer_type: 'Strategic Buyer',
      inferred_buyer_type: 'Strategic',
      normalised_text: 'BUY_SIDE | TECHNOLOGY | 100% Full Acquisition',
      similarity: 0.78,
      advisor_name: null,
      contact_phone: null,
      fraud_flags: [],
      quality_tier: 1,
      created_at: new Date().toISOString(),
    };

    const hrResult = applyHardRejections(baseAiFundraise, fullBuyoutTechBuyer);
    expect(hrResult.rejected).toBe(true);
    expect(hrResult.reason).toContain('HR-3');
    expect(hrResult.reason).toMatch(/buyout/i);
  });

  it('3. ACCEPTS compatible AI/technology investor with high match score', () => {
    const aiInvestorCandidate: Candidate = {
      id: 'cand-ai-inv-003',
      user_id: 'user-cand-003',
      intent: 'BUY_SIDE',
      industry: 'AI and Data Analytics',
      sectors: ['TECHNOLOGY'],
      serving_sectors: ['Enterprise Tech', 'Analytics'],
      geographies: ['Pune', 'Mumbai'],
      deal_size_min_cr: 3,
      deal_size_max_cr: 8,
      revenue_min_cr: 1,
      revenue_max_cr: 10,
      deal_structure: 'Convertible Note / Minority Equity',
      buyer_type: 'VC Fund',
      inferred_buyer_type: 'Financial',
      normalised_text: 'BUY_SIDE | AI and Data Analytics | Convertible Note',
      similarity: 0.85,
      advisor_name: null,
      contact_phone: null,
      fraud_flags: [],
      quality_tier: 1,
      created_at: new Date().toISOString(),
    };

    const hrResult = applyHardRejections(baseAiFundraise, aiInvestorCandidate);
    expect(hrResult.rejected).toBe(false);

    const scoreResult = calculateV2Score(baseAiFundraise, aiInvestorCandidate);
    expect(scoreResult.finalScore).toBeGreaterThanOrEqual(75);
    expect(scoreResult.breakdown.industryScore).toBe(1.0);
    expect(scoreResult.archetype).toBe('Same-sector bolt-on');
  });

  it('4. ACCEPTS candidate that explicitly serves AI/data analytics industry', () => {
    const crossSectorInvestor: Candidate = {
      id: 'cand-serv-004',
      user_id: 'user-cand-004',
      intent: 'BUY_SIDE',
      industry: 'Strategic Tech Growth Capital',
      sectors: ['FINTECH'],
      serving_sectors: ['AI/data analytics', 'Data Science', 'SaaS'],
      geographies: ['Mumbai', 'Pan-India'],
      deal_size_min_cr: 5,
      deal_size_max_cr: 10,
      revenue_min_cr: 2,
      revenue_max_cr: 10,
      deal_structure: 'Convertible Debenture / Minority Stake',
      buyer_type: 'Family Office',
      inferred_buyer_type: 'Financial',
      normalised_text: 'BUY_SIDE | Strategic Tech Growth Capital | serves AI/data analytics',
      similarity: 0.80,
      advisor_name: null,
      contact_phone: null,
      fraud_flags: [],
      quality_tier: 1,
      created_at: new Date().toISOString(),
    };

    const hrResult = applyHardRejections(baseAiFundraise, crossSectorInvestor);
    expect(hrResult.rejected).toBe(false);

    const scoreResult = calculateV2Score(baseAiFundraise, crossSectorInvestor);
    expect(scoreResult.breakdown.industryScore).toBeGreaterThanOrEqual(0.40);
    expect(scoreResult.archetype).toMatch(/Technology enablement|Cross-sector capability/);
  });

  it('5. NEVER treats GENERAL as an exact industry match', () => {
    const generalCandidate: Candidate = {
      id: 'cand-gen-005',
      user_id: 'user-cand-005',
      intent: 'BUY_SIDE',
      industry: null,
      sectors: ['GENERAL'],
      serving_sectors: [],
      geographies: ['Pune'],
      deal_size_min_cr: 5,
      deal_size_max_cr: 5,
      revenue_min_cr: 2,
      revenue_max_cr: 2,
      deal_structure: 'Minority Equity',
      buyer_type: 'Investor',
      inferred_buyer_type: 'Financial',
      normalised_text: 'BUY_SIDE | GENERAL | Pune | ₹5 Cr',
      similarity: 0.40,
      advisor_name: null,
      contact_phone: null,
      fraud_flags: [],
      quality_tier: 3,
      created_at: new Date().toISOString(),
    };

    const comp = resolveIndustryCompatibility(
      { industry: baseAiFundraise.industry, sector: baseAiFundraise.sector },
      { industry: generalCandidate.industry, sector: generalCandidate.sectors?.[0] }
    );

    expect(comp.isSpecificIndustryMatch).toBe(false);
    expect(comp.isGeneralFallback).toBe(true);
    expect(comp.score).toBeLessThanOrEqual(0.20);
    expect(comp.score).not.toBe(1.0);

    const scoreResult = calculateV2Score(baseAiFundraise, generalCandidate);
    // Even with Pune location matching and identical deal size, general candidate must NOT score high
    expect(scoreResult.finalScore).toBeLessThan(55);
  });

  it('6. Pune geography boost alone CANNOT push an unknown / unrelated industry candidate into results', () => {
    const unrelatedSameCityCandidate: Candidate = {
      id: 'cand-unrel-006',
      user_id: 'user-cand-006',
      intent: 'BUY_SIDE',
      industry: 'Commercial Poultry Farming',
      sectors: ['AGRICULTURE'],
      serving_sectors: [],
      geographies: ['Pune'],
      deal_size_min_cr: 5,
      deal_size_max_cr: 5,
      revenue_min_cr: 2,
      revenue_max_cr: 2,
      deal_structure: 'Minority Stake',
      buyer_type: 'Operator',
      inferred_buyer_type: 'Strategic',
      normalised_text: 'BUY_SIDE | Poultry Farming | Pune',
      similarity: 0.30,
      advisor_name: null,
      contact_phone: null,
      fraud_flags: [],
      quality_tier: 2,
      created_at: new Date().toISOString(),
    };

    const scoreResult = calculateV2Score(baseAiFundraise, unrelatedSameCityCandidate);
    expect(scoreResult.finalScore).toBeLessThan(50);
  });

  it('7. buildCanonicalText includes industry and serving_sectors in query representation', () => {
    const text = buildCanonicalText({
      ...baseAiFundraise,
      serving_sectors: ['Healthcare', 'Manufacturing'],
      buyer_type: 'Growth Fund',
    });

    expect(text).toContain('AI/data analytics');
    expect(text).toContain('serves: Healthcare, Manufacturing');
    expect(text).toContain('buyer_type: Growth Fund');
    expect(text).toContain('deal size 5 crore');
  });
});
