import { describe, it, expect } from 'vitest';
import {
  normalizeCapitalStructure,
  applyHardRejections,
  type ProposalInput,
  type Candidate,
} from '../matchmakingEngine';

describe('HR-3 Capital and Control Compatibility Hardening', () => {
  describe('normalizeCapitalStructure', () => {
    it('normalizes buyout and control terms', () => {
      expect(normalizeCapitalStructure('BUY_SIDE', '100% / Full Buyout')).toBe('FULL_BUYOUT');
      expect(normalizeCapitalStructure('BUY_SIDE', 'Majority / Control Acquisition')).toBe('CONTROL_ACQUISITION');
      expect(normalizeCapitalStructure('SELL_SIDE', '100% Full Acquisition')).toBe('FULL_BUYOUT');
      expect(normalizeCapitalStructure('BUY_SIDE', 'majority stake')).toBe('CONTROL_ACQUISITION');
    });

    it('normalizes growth and minority equity terms', () => {
      expect(normalizeCapitalStructure('FUNDRAISING', 'Minority Stake')).toBe('MINORITY_EQUITY');
      expect(normalizeCapitalStructure('BUY_SIDE', 'Growth Equity')).toBe('GROWTH_EQUITY');
      expect(normalizeCapitalStructure('BUY_SIDE', 'Minority investment in SaaS')).toBe('MINORITY_EQUITY');
      expect(normalizeCapitalStructure('FUNDRAISING', null)).toBe('MINORITY_EQUITY');
    });

    it('normalizes debt instruments', () => {
      expect(normalizeCapitalStructure('DEBT', 'Structured Debt / Term Loan')).toBe('DEBT');
      expect(normalizeCapitalStructure('FUNDRAISING', 'Structured Debt')).toBe('DEBT');
      expect(normalizeCapitalStructure('DEBT', null)).toBe('DEBT');
    });

    it('normalizes convertible and structured equity', () => {
      expect(normalizeCapitalStructure('FUNDRAISING', 'Convertible Debenture / CCD / CCPS')).toBe('STRUCTURED_EQUITY');
      expect(normalizeCapitalStructure('BUY_SIDE', 'Convertible Note')).toBe('STRUCTURED_EQUITY');
    });
  });

  describe('HR-3 Compatibility Regressions & Query 8 Fix', () => {
    const createBaseProposal = (intent: string, structure: string, dealSize = 10): ProposalInput => ({
      userId: 'user-src-001',
      intent,
      raw_text: `${intent} mandate with ${structure}`,
      sector: 'TECHNOLOGY',
      industry: 'Enterprise Software',
      geography: 'Mumbai',
      structure,
      deal_structure: structure,
      deal_size_min_cr: dealSize,
      deal_size_max_cr: dealSize,
    });

    const createBaseCandidate = (intent: string, structure: string, dealSize = 10): Candidate => ({
      id: 'cand-001',
      user_id: 'user-cnd-001',
      intent,
      industry: 'Enterprise Software',
      sectors: ['TECHNOLOGY'],
      serving_sectors: [],
      geographies: ['Mumbai'],
      deal_size_min_cr: dealSize,
      deal_size_max_cr: dealSize,
      revenue_min_cr: dealSize,
      revenue_max_cr: dealSize,
      deal_structure: structure,
      buyer_type: 'Financial Sponsor',
      inferred_buyer_type: 'Financial',
      normalised_text: `${intent} | TECHNOLOGY | ${structure}`,
      similarity: 0.85,
      advisor_name: null,
      contact_phone: null,
      fraud_flags: [],
      quality_tier: 1,
      created_at: new Date().toISOString(),
    });

    it('1. MUST ALLOW: FUNDRAISING + Minority Stake vs BUY_SIDE + Minority Stake', () => {
      const src = createBaseProposal('FUNDRAISING', 'Minority Stake');
      const cnd = createBaseCandidate('BUY_SIDE', 'Minority Stake');
      const res = applyHardRejections(src, cnd);
      expect(res.rejected).toBe(false);
    });

    it('2. MUST ALLOW: FUNDRAISING + Growth Equity vs BUY_SIDE + Growth Equity', () => {
      const src = createBaseProposal('FUNDRAISING', 'Growth Equity');
      const cnd = createBaseCandidate('BUY_SIDE', 'Growth Equity');
      const res = applyHardRejections(src, cnd);
      expect(res.rejected).toBe(false);
    });

    it('3. MUST REJECT: FUNDRAISING + Minority Stake vs BUY_SIDE + 100% / Full Buyout (HR-3)', () => {
      const src = createBaseProposal('FUNDRAISING', 'Minority Stake');
      const cnd = createBaseCandidate('BUY_SIDE', '100% / Full Buyout');
      const res = applyHardRejections(src, cnd);
      expect(res.rejected).toBe(true);
      expect(res.reason).toContain('HR-3');
    });

    it('4. MUST ALLOW: SELL_SIDE + 100% / Full Buyout vs BUY_SIDE + Majority / Control Acquisition', () => {
      const src = createBaseProposal('SELL_SIDE', '100% / Full Buyout');
      const cnd = createBaseCandidate('BUY_SIDE', 'Majority / Control Acquisition');
      const res = applyHardRejections(src, cnd);
      expect(res.rejected).toBe(false);
    });

    it('5. MUST REJECT: SELL_SIDE + 100% / Full Buyout vs BUY_SIDE + Minority Stake (HR-3)', () => {
      const src = createBaseProposal('SELL_SIDE', '100% / Full Buyout');
      const cnd = createBaseCandidate('BUY_SIDE', 'Minority Stake');
      const res = applyHardRejections(src, cnd);
      expect(res.rejected).toBe(true);
      expect(res.reason).toContain('HR-3');
    });

    it('6. MUST ALLOW: DEBT + Structured Debt / Term Loan vs DEBT + Term Loan Lender', () => {
      const src = createBaseProposal('DEBT', 'Structured Debt / Term Loan');
      const cnd = createBaseCandidate('DEBT', 'Structured Debt / Term Loan');
      const res = applyHardRejections(src, cnd);
      expect(res.rejected).toBe(false);
    });

    it('7. MUST REJECT: DEBT + Structured Debt / Term Loan vs BUY_SIDE + 100% / Full Buyout', () => {
      const src = createBaseProposal('DEBT', 'Structured Debt / Term Loan');
      const cnd = createBaseCandidate('BUY_SIDE', '100% / Full Buyout');
      const res = applyHardRejections(src, cnd);
      expect(res.rejected).toBe(true);
      expect(res.reason).toMatch(/HR-1|HR-3/);
    });

    it('8. QUERY 8 REGRESSION: FUNDRAISING + Structured Debt vs BUY_SIDE + 100% / Full Buyout', () => {
      const src = createBaseProposal('FUNDRAISING', 'Structured Debt / Term Loan');
      const cnd = createBaseCandidate('BUY_SIDE', '100% / Full Buyout');
      const res = applyHardRejections(src, cnd);
      expect(res.rejected).toBe(true);
      expect(res.reason).toContain('HR-3');
    });
  });
});
