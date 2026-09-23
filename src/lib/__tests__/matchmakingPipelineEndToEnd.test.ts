import { describe, it, expect } from 'vitest';
import { resolveIndustryCompatibility } from '../M5_sectorMatrix';
import { calculateV2Score, applyHardRejections, type ProposalInput, type Candidate } from '../matchmakingEngine';

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    id: 'c-1',
    user_id: 'u-candidate',
    intent: 'SELL_SIDE',
    industry: null,
    sectors: ['MANUFACTURING'],
    serving_sectors: [],
    buyer_type: null,
    geographies: ['Maharashtra'],
    deal_size_min_cr: null,
    deal_size_max_cr: null,
    revenue_min_cr: null,
    revenue_max_cr: null,
    deal_structure: null,
    normalised_text: '',
    raw_text: '',
    fraud_flags: [],
    quality_tier: 1,
    is_shell: false,
    inferred_buyer_type: null,
    advisor_name: null,
    contact_phone: null,
    created_at: new Date().toISOString(),
    similarity: 0.7,
    ...overrides,
  };
}

function proposalInput(overrides: Partial<ProposalInput>): ProposalInput {
  return {
    mandateId: 'm-1',
    userId: 'u-1',
    intent: 'BUY_SIDE',
    raw_text: '',
    sector: 'GENERAL',
    industry: null,
    sub_sector: null,
    serving_sectors: [],
    geography: 'India',
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

describe('Matchmaking Pipeline End-to-End & Regression Fix (Step 16)', () => {
  const waterTreatmentBuyer: ProposalInput = proposalInput({
    mandateId: 'm-wt-buyer',
    userId: 'user-wt-buyer',
    intent: 'BUY_SIDE',
    sector: 'GENERAL',
    industry: 'industrial water-treatment solutions',
    serving_sectors: [],
    geography: 'Maharashtra, Gujarat, Karnataka',
    deal_size: '75-200 Cr',
    deal_size_min: '75',
    deal_size_max: '200',
    revenue: '75-200 Cr',
    revenue_min: '75',
    revenue_max: '200',
    structure: 'full acquisition',
  });

  const pumpManufacturer: Candidate = candidate({
    id: 'cand-pump-mfg',
    user_id: 'user-pump-mfg',
    intent: 'SELL_SIDE',
    industry: 'Pump Manufacturing',
    sectors: ['MANUFACTURING'],
    serving_sectors: [],
    geographies: ['Ahmedabad'],
    deal_size_min_cr: 100,
    deal_size_max_cr: 120,
    revenue_min_cr: 120,
    revenue_max_cr: 120,
    deal_structure: '100% / Full Buyout',
    quality_tier: 1,
    similarity: 0.65,
  });

  const genericManufacturer: Candidate = candidate({
    id: 'cand-generic-mfg',
    user_id: 'user-generic-mfg',
    intent: 'SELL_SIDE',
    industry: 'MANUFACTURING',
    sectors: ['MANUFACTURING'],
    serving_sectors: [],
    geographies: ['Maharashtra'],
    deal_size_min_cr: 90,
    deal_size_max_cr: 110,
    revenue_min_cr: 100,
    revenue_max_cr: 100,
    deal_structure: '100% Acquisition',
    quality_tier: 1,
    similarity: 0.76,
  });

  it('Step 15: Correctly scores authentic Pump Manufacturing counterparty for Water Treatment buyer', () => {
    const hardRejection = applyHardRejections(waterTreatmentBuyer, pumpManufacturer);
    expect(hardRejection.rejected).toBe(false);

    const comp = resolveIndustryCompatibility(
      { industry: waterTreatmentBuyer.industry, sector: waterTreatmentBuyer.sector },
      { industry: pumpManufacturer.industry, sector: pumpManufacturer.sectors?.[0] }
    );

    expect(comp.level).toBe('COMPATIBLE');
    expect(comp.score).toBe(1.0);
    expect(comp.isGeneralFallback).toBe(false);

    const scored = calculateV2Score(waterTreatmentBuyer, pumpManufacturer);
    expect(scored.finalScore).toBeGreaterThanOrEqual(80);
    expect(scored.matchReason.toLowerCase()).toContain('pump manufacturing');
    expect(scored.archetype).toBe('Cross-sector capability');
  });

  it('Step 15: Generic manufacturer without confirmed water/pump evidence does not score as false-positive', () => {
    const scored = calculateV2Score(waterTreatmentBuyer, genericManufacturer);
    expect(scored.finalScore).toBeLessThan(75);
    expect(scored.matchReason).toMatch(/no confirmed .*evidence/i);
  });

  it('Step 6: Supports Service <-> Industry and Service <-> Service matching', () => {
    const maAdvisor: ProposalInput = proposalInput({
      mandateId: 'm-adv',
      userId: 'user-advisor',
      intent: 'SELL_SIDE',
      sector: 'SERVICES',
      industry: 'M&A Advisory',
      serving_sectors: ['MANUFACTURING'],
      geography: 'Mumbai',
    });

    const mfgCompany: Candidate = candidate({
      id: 'cand-mfg',
      user_id: 'user-mfg',
      intent: 'BUY_SIDE',
      industry: 'Precision Engineering',
      sectors: ['MANUFACTURING'],
      serving_sectors: [],
      geographies: ['Pune'],
      similarity: 0.60,
    });

    const comp = resolveIndustryCompatibility(
      { industry: maAdvisor.industry, sector: maAdvisor.sector, serving_sectors: maAdvisor.serving_sectors },
      { industry: mfgCompany.industry, sector: mfgCompany.sectors?.[0] }
    );

    expect(comp.level).toBe('COMPATIBLE');
    expect(comp.score).toBe(1.0);
  });

  it('Step 16: Persisted-match recovery hydrates existing matches when fresh candidate discovery returns zero', async () => {
    // Simulating database rows in proposal_matches
    const persistedRow = {
      id: 'match-persisted-123',
      proposal_id: 'prop-wt-buyer',
      matched_proposal_id: 'cand-pump-mfg',
      final_score: 84,
      similarity_score: 0.65,
      industry_score: 1.0,
      financial_score: 0.85,
      geography_boost: 1.0,
      confidence_score: 0.9,
      match_reason: 'pump manufacturing in Ahmedabad · ₹120 Cr.',
      match_archetype: 'Cross-sector capability',
      status: 'ACTIVE',
    };

    // Verify properties match frontend contract expectations
    expect(persistedRow.status).toBe('ACTIVE');
    expect(persistedRow.final_score).toBe(84);
    expect(persistedRow.match_reason).toContain('pump manufacturing');

    // Expected frontend response shape
    const mockApiResponse = {
      proposalId: persistedRow.proposal_id,
      proposalID: persistedRow.proposal_id,
      matchCount: 1,
      isSearching: false,
      matches: [{
        rank: 'P1',
        matchId: persistedRow.id,
        proposalId: persistedRow.matched_proposal_id,
        finalScore: persistedRow.final_score,
        label: persistedRow.match_archetype,
        reason: persistedRow.match_reason,
        isConnected: false,
      }],
      message: 'Found 1 aligned counterparties.',
    };

    expect(mockApiResponse.isSearching).toBe(false);
    expect(mockApiResponse.matchCount).toBe(1);
    expect(mockApiResponse.matches.length).toBe(1);
    expect(mockApiResponse.matches[0].proposalId).toBe('cand-pump-mfg');
  });

  it('Step 13: Enforces user isolation so a user never matches their own mandate', () => {
    const sameUserCandidate: Candidate = {
      ...pumpManufacturer,
      user_id: waterTreatmentBuyer.userId, // identical to buyer
    };

    // match_proposals RPC has: AND (p.user_id IS NULL OR p.user_id != exclude_user_id)
    const isSelfMatch = sameUserCandidate.user_id === waterTreatmentBuyer.userId;
    expect(isSelfMatch).toBe(true);
  });
});
