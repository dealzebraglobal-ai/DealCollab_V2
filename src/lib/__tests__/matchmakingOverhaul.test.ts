import { describe, it, expect } from 'vitest';
import { getIndustryCompatibility, resolveIndustryCompatibility } from '../M5_sectorMatrix';
import {
  applyHardRejections,
  calculateV2Score,
  type ProposalInput,
  type Candidate,
} from '../matchmakingEngine';

describe('Matchmaking Engine Overhaul Regression Tests', () => {

  describe('AI / Data Analytics Fundraise Mandate', () => {
    const aiFundraiseMandate: ProposalInput = {
      mandateId: 'ai-fundraise-pune-001',
      userId: 'user-founder-001',
      intent: 'FUNDRAISING',
      raw_text: 'Raising ₹5 Cr via convertible debentures for AI / data analytics platform in Pune.',
      sector: 'saas',
      industry: 'AI / Data Analytics',
      sub_sector: null,
      serving_sectors: ['FINTECH', 'HEALTHCARE'],
      geography: 'Pune',
      deal_size: '5 Cr',
      revenue: '2 Cr',
      structure: 'Convertible Debenture',
      intent_focus: 'Growth Capital',
      industry_data: {},
      special_conditions: [],
      deal_size_min: '5',
      deal_size_max: '5',
      revenue_min: '2',
      revenue_max: '2',
      buyer_type: 'PE/VC',
    };

    it('1. REJECTS unrelated manufacturing majority buyout buyer (HR-4 & HR-3)', () => {
      const manufacturingBuyoutCandidate: Candidate = {
        id: 'cand-mfg-buyout-001',
        user_id: 'user-buyer-001',
        intent: 'BUY_SIDE',
        industry: 'Sheet Metal Stamping',
        sectors: ['MANUFACTURING'],
        serving_sectors: ['AUTO_ANCILLARY'],
        geographies: ['Pune'],
        deal_size_min_cr: 5,
        deal_size_max_cr: 10,
        revenue_min_cr: 5,
        revenue_max_cr: 20,
        deal_structure: '100% Cash Out',
        buyer_type: 'Strategic',
        normalised_text: 'Looking for 100% acquisition of sheet metal manufacturing in Pune',
        similarity: 0.45,
        fraud_flags: null,
        quality_tier: 1,
        is_shell: false,
        inferred_buyer_type: null,
        advisor_name: null,
        contact_phone: null,
        created_at: new Date().toISOString(),
      };

      const hardCheck = applyHardRejections(aiFundraiseMandate, manufacturingBuyoutCandidate);
      expect(hardCheck.rejected).toBe(true);
      expect(['HR-3', 'HR-4'].some(k => hardCheck.reason?.includes(k))).toBe(true);
    });

    it('2. REJECTS 100% majority buyout buyer even within tech (HR-3)', () => {
      const techBuyoutCandidate: Candidate = {
        id: 'cand-tech-buyout-002',
        user_id: 'user-buyer-002',
        intent: 'BUY_SIDE',
        industry: 'Enterprise SaaS',
        sectors: ['TECHNOLOGY'],
        serving_sectors: [],
        geographies: ['Pan-India'],
        deal_size_min_cr: 5,
        deal_size_max_cr: 10,
        revenue_min_cr: 2,
        revenue_max_cr: 10,
        deal_structure: '100% Full Buyout',
        buyer_type: 'Strategic',
        normalised_text: 'Looking for 100% buyout of software companies',
        similarity: 0.85,
        fraud_flags: null,
        quality_tier: 1,
        is_shell: false,
        inferred_buyer_type: null,
        advisor_name: null,
        contact_phone: null,
        created_at: new Date().toISOString(),
      };

      const hardCheck = applyHardRejections(aiFundraiseMandate, techBuyoutCandidate);
      expect(hardCheck.rejected).toBe(true);
      expect(hardCheck.reason).toContain('HR-3');
    });

    it('3. ACCEPTS compatible AI / Tech growth investor / fund', () => {
      const techInvestorCandidate: Candidate = {
        id: 'cand-tech-investor-003',
        user_id: 'user-investor-003',
        intent: 'BUY_SIDE',
        industry: 'AI / Data Analytics',
        sectors: ['TECHNOLOGY'],
        serving_sectors: ['FINTECH', 'HEALTHCARE'],
        geographies: ['Pan-India', 'Pune', 'Maharashtra'],
        deal_size_min_cr: 3,
        deal_size_max_cr: 10,
        revenue_min_cr: 1,
        revenue_max_cr: 10,
        deal_structure: 'Minority Growth Equity / Convertible',
        buyer_type: 'PE/VC',
        normalised_text: 'Investing ₹3-10 Cr in AI, ML and data analytics startups',
        similarity: 0.88,
        fraud_flags: null,
        quality_tier: 1,
        is_shell: false,
        inferred_buyer_type: null,
        advisor_name: null,
        contact_phone: null,
        created_at: new Date().toISOString(),
      };

      const hardCheck = applyHardRejections(aiFundraiseMandate, techInvestorCandidate);
      expect(hardCheck.rejected).toBe(false);

      const score = calculateV2Score(aiFundraiseMandate, techInvestorCandidate);
      expect(score.finalScore).toBeGreaterThanOrEqual(75);
    });

    it('4. NEVER treats GENERAL as an exact industry match for a specific mandate', () => {
      const generalCandidate: Candidate = {
        id: 'cand-general-004',
        user_id: 'user-gen-004',
        intent: 'BUY_SIDE',
        industry: null,
        sectors: ['GENERAL'],
        serving_sectors: [],
        geographies: ['Pune'],
        deal_size_min_cr: 5,
        deal_size_max_cr: 5,
        revenue_min_cr: 2,
        revenue_max_cr: 2,
        deal_structure: 'Minority Stake',
        buyer_type: 'General',
        normalised_text: 'Looking for generic investment opportunities in Pune',
        similarity: 0.50,
        fraud_flags: null,
        quality_tier: 3,
        is_shell: false,
        inferred_buyer_type: null,
        advisor_name: null,
        contact_phone: null,
        created_at: new Date().toISOString(),
      };

      const indComp = getIndustryCompatibility(
        aiFundraiseMandate.industry,
        generalCandidate.industry,
        aiFundraiseMandate.sector,
        generalCandidate.sectors?.[0]
      );
      expect(indComp.reason).not.toContain('Exact category match: GENERAL');
    });
  });

  describe('Serving Sectors & Cross-Sector Capability', () => {
    it('evaluates Pharma Acquirer vs Flexible Packaging (serving Pharma) as SERVING_SECTOR_MATCH with penalty 0', () => {
      const comp = resolveIndustryCompatibility(
        { industry: 'Pharmaceutical Formulations CDMO', sector: 'pharma' },
        { industry: 'Flexible Packaging Manufacturing', sectors: ['manufacturing'], serving_sectors: ['PHARMACEUTICALS', 'HEALTHCARE'] }
      );

      expect(comp.level).toBe('SERVING_SECTOR_MATCH');
      expect(comp.penalty).toBe(0);
      expect(comp.reason).toContain('Cross-sector capability');
    });

    it('evaluates bidirectional symmetry for serving_sectors', () => {
      const compA = resolveIndustryCompatibility(
        { industry: 'Pharmaceuticals', sector: 'pharma' },
        { industry: 'Packaging', sectors: ['manufacturing'], serving_sectors: ['PHARMACEUTICALS'] }
      );

      const compB = resolveIndustryCompatibility(
        { industry: 'Packaging', sector: 'manufacturing', serving_sectors: ['PHARMACEUTICALS'] },
        { industry: 'Pharmaceuticals', sectors: ['pharma'] }
      );

      expect(compA.level).toBe('SERVING_SECTOR_MATCH');
      expect(compB.level).toBe('SERVING_SECTOR_MATCH');
    });
  });

  describe('Strict Incompatibility Gates', () => {
    it('evaluates Wooden Toys vs Sheet Metal Manufacturing as INCOMPATIBLE', () => {
      const comp = getIndustryCompatibility(
        'Wooden Toys',
        'Sheet Metal Stamping',
        'consumer',
        'manufacturing'
      );
      expect(comp.level).toBe('INCOMPATIBLE');
      expect(comp.penalty).toBe(1.0);
    });

    it('evaluates AI / Data Analytics vs Heavy Manufacturing as NARROW', () => {
      const comp = getIndustryCompatibility(
        'AI / Data Analytics',
        'Heavy Industrial Machinery Manufacturing',
        'saas',
        'manufacturing'
      );
      expect(comp.level).toBe('NARROW');
    });
  });

  describe('Industry & Service Sector Matrix & Scoring Verification', () => {
    // 1. Industry -> Industry
    it('Test 1: Industry -> Industry: Automotive Tier-1 Buyer vs Auto Component Manufacturer', () => {
      const autoBuyer: ProposalInput = {
        mandateId: 'm-auto-buyer-1',
        userId: 'u-1',
        intent: 'BUY_SIDE',
        raw_text: 'Acquiring auto component manufacturing plant in Pune or Chennai with ₹50-100 Cr revenue',
        sector: 'auto ancillary',
        industry: 'Automotive Component Manufacturing',
        sub_sector: null,
        serving_sectors: ['AUTOMOTIVE', 'MANUFACTURING'],
        geography: 'Pune',
        deal_size: '50-100 Cr',
        revenue: '50-100 Cr',
        structure: '100% Acquisition',
        intent_focus: 'Consolidation',
        industry_data: {},
        special_conditions: [],
        deal_size_min: '50',
        deal_size_max: '100',
        revenue_min: '50',
        revenue_max: '100',
      };

      const autoTarget: Candidate = {
        id: 'c-auto-target-1',
        user_id: 'u-2',
        intent: 'SELL_SIDE',
        industry: 'Auto Components / Precision Engineering',
        sectors: ['AUTO_ANCILLARY'],
        serving_sectors: ['AUTOMOTIVE'],
        geographies: ['Pune'],
        deal_size_min_cr: 50,
        deal_size_max_cr: 100,
        revenue_min_cr: 60,
        revenue_max_cr: 80,
        deal_structure: '100% Full Buyout',
        normalised_text: 'Auto component manufacturing and precision engineering in Pune',
        similarity: 0.85,
        fraud_flags: null,
        quality_tier: 1,
        is_shell: false,
        buyer_type: null,
        inferred_buyer_type: null,
        advisor_name: null,
        contact_phone: null,
        created_at: new Date().toISOString(),
      };

      const hardCheck = applyHardRejections(autoBuyer, autoTarget);
      expect(hardCheck.rejected).toBe(false);

      const score = calculateV2Score(autoBuyer, autoTarget);
      expect(score.finalScore).toBeGreaterThanOrEqual(80);
      expect(score.breakdown.industryScore).toBe(0.9);
    });

    // 2. Service -> Service
    it('Test 2: Service -> Service: M&A Advisor vs Private Equity Firm', () => {
      const maAdvisor: ProposalInput = {
        mandateId: 'm-ma-advisor-1',
        userId: 'u-advisor-1',
        intent: 'BUY_SIDE',
        raw_text: 'Corporate finance and M&A advisory firm looking for private equity partners and co-advisory alliances',
        sector: 'services',
        industry: 'M&A Advisory',
        sub_sector: null,
        serving_sectors: ['FINANCIAL_SERVICES', 'SERVICES'],
        geography: 'Mumbai',
        deal_size: null,
        revenue: null,
        structure: 'Partnership',
        intent_focus: 'Strategic Alliance',
        industry_data: {},
        special_conditions: [],
        deal_size_min: null,
        deal_size_max: null,
        revenue_min: null,
        revenue_max: null,
      };

      const peFirm: Candidate = {
        id: 'c-pe-firm-1',
        user_id: 'u-pe-1',
        intent: 'SELL_SIDE',
        industry: 'Private Equity Investment Advisory',
        sectors: ['FINANCIAL_SERVICES'],
        serving_sectors: ['SERVICES'],
        geographies: ['Mumbai'],
        deal_size_min_cr: null,
        deal_size_max_cr: null,
        revenue_min_cr: null,
        revenue_max_cr: null,
        deal_structure: 'Strategic Partnership',
        normalised_text: 'Private equity firm seeking advisory partnerships',
        similarity: 0.80,
        fraud_flags: null,
        quality_tier: 1,
        is_shell: false,
        buyer_type: null,
        inferred_buyer_type: null,
        advisor_name: null,
        contact_phone: null,
        created_at: new Date().toISOString(),
      };

      const hardCheck = applyHardRejections(maAdvisor, peFirm);
      expect(hardCheck.rejected).toBe(false);

      const comp = resolveIndustryCompatibility(
        { industry: maAdvisor.industry, sector: maAdvisor.sector, serving_sectors: maAdvisor.serving_sectors },
        { industry: peFirm.industry, sectors: peFirm.sectors, serving_sectors: peFirm.serving_sectors }
      );
      expect(comp.level).toBe('SERVING_SECTOR_MATCH');
    });

    // 3. Industry -> Service
    it('Test 3: Industry -> Service: Manufacturing Company seeking M&A Advisor / Sponsor', () => {
      const mfgCompany: ProposalInput = {
        mandateId: 'm-mfg-sell-1',
        userId: 'u-mfg-1',
        intent: 'SELL_SIDE',
        raw_text: 'Industrial machinery manufacturing company seeking M&A advisory or strategic investor for exit',
        sector: 'manufacturing',
        industry: 'Industrial Machinery Manufacturing',
        sub_sector: null,
        serving_sectors: ['MANUFACTURING'],
        geography: 'Gujarat',
        deal_size: '30-50 Cr',
        revenue: '40 Cr',
        structure: 'Majority Stake',
        intent_focus: 'Exit',
        industry_data: {},
        special_conditions: [],
        deal_size_min: '30',
        deal_size_max: '50',
        revenue_min: '30',
        revenue_max: '50',
      };

      const financialSponsor: Candidate = {
        id: 'c-fin-sponsor-1',
        user_id: 'u-fin-1',
        intent: 'BUY_SIDE',
        industry: 'M&A Advisory & Financial Sponsorship',
        sectors: ['FINANCIAL_SERVICES'],
        serving_sectors: ['MANUFACTURING'],
        geographies: ['Pan-India', 'Gujarat'],
        deal_size_min_cr: 25,
        deal_size_max_cr: 60,
        revenue_min_cr: 20,
        revenue_max_cr: 100,
        deal_structure: 'Majority Stake',
        normalised_text: 'M&A advisory and financial sponsor for manufacturing companies',
        similarity: 0.78,
        fraud_flags: null,
        quality_tier: 1,
        is_shell: false,
        buyer_type: null,
        inferred_buyer_type: null,
        advisor_name: null,
        contact_phone: null,
        created_at: new Date().toISOString(),
      };

      const hardCheck = applyHardRejections(mfgCompany, financialSponsor);
      expect(hardCheck.rejected).toBe(false);

      const comp = resolveIndustryCompatibility(
        { industry: mfgCompany.industry, sector: mfgCompany.sector, serving_sectors: mfgCompany.serving_sectors },
        { industry: financialSponsor.industry, sectors: financialSponsor.sectors, serving_sectors: financialSponsor.serving_sectors }
      );
      expect(comp.level).toBe('SERVING_SECTOR_MATCH');
    });

    // 4. Service -> Industry
    it('Test 4: Service -> Industry: Tech Service Provider vs Manufacturing Company seeking automation', () => {
      const techService: ProposalInput = {
        mandateId: 'm-tech-service-1',
        userId: 'u-tech-1',
        intent: 'SELL_SIDE',
        raw_text: 'Technology services firm delivering Industry 4.0 automation and enterprise software to manufacturers',
        sector: 'services',
        industry: 'Technology Services',
        sub_sector: null,
        serving_sectors: ['MANUFACTURING'],
        geography: 'Bangalore',
        deal_size: '20 Cr',
        revenue: '15 Cr',
        structure: 'Partnership',
        intent_focus: 'Growth',
        industry_data: {},
        special_conditions: [],
        deal_size_min: '15',
        deal_size_max: '25',
        revenue_min: '10',
        revenue_max: '20',
      };

      const mfgPartner: Candidate = {
        id: 'c-mfg-partner-1',
        user_id: 'u-mfg-2',
        intent: 'BUY_SIDE',
        industry: 'Precision Engineering & Manufacturing',
        sectors: ['MANUFACTURING'],
        serving_sectors: [],
        geographies: ['Bangalore', 'Karnataka'],
        deal_size_min_cr: 10,
        deal_size_max_cr: 30,
        revenue_min_cr: 10,
        revenue_max_cr: 50,
        deal_structure: 'Partnership',
        normalised_text: 'Precision engineering and manufacturing company in Bangalore',
        similarity: 0.75,
        fraud_flags: null,
        quality_tier: 1,
        is_shell: false,
        buyer_type: null,
        inferred_buyer_type: null,
        advisor_name: null,
        contact_phone: null,
        created_at: new Date().toISOString(),
      };

      const hardCheck = applyHardRejections(techService, mfgPartner);
      expect(hardCheck.rejected).toBe(false);

      const comp = resolveIndustryCompatibility(
        { industry: techService.industry, sector: techService.sector, serving_sectors: techService.serving_sectors },
        { industry: mfgPartner.industry, sectors: mfgPartner.sectors, serving_sectors: mfgPartner.serving_sectors }
      );
      expect(comp.level).toBe('SERVING_SECTOR_MATCH');
    });

    // 5. Coarse sector candidate fallback — never hard rejects when industry is missing/coarse
    it('Test 5: Coarse Candidate Fallback: Candidate with only sector="MANUFACTURING" and null industry is not rejected', () => {
      const detailedSource: ProposalInput = {
        mandateId: 'm-src-1',
        userId: 'u-src-1',
        intent: 'BUY_SIDE',
        raw_text: 'Acquiring contract manufacturing business with ₹20-50 Cr revenue',
        sector: 'manufacturing',
        industry: 'Contract Manufacturing for Electronics',
        sub_sector: null,
        serving_sectors: [],
        geography: 'Mumbai',
        deal_size: '20-50 Cr',
        revenue: '20-50 Cr',
        structure: '100% Acquisition',
        intent_focus: null,
        industry_data: {},
        special_conditions: [],
        deal_size_min: '20',
        deal_size_max: '50',
        revenue_min: '20',
        revenue_max: '50',
      };

      const legacyCandidate: Candidate = {
        id: 'c-legacy-1',
        user_id: 'u-legacy-1',
        intent: 'SELL_SIDE',
        industry: null, // Legacy candidate with no granular industry
        sectors: ['MANUFACTURING'],
        serving_sectors: [],
        geographies: ['Mumbai'],
        deal_size_min_cr: 25,
        deal_size_max_cr: 40,
        revenue_min_cr: 25,
        revenue_max_cr: 40,
        deal_structure: '100% Full Buyout',
        normalised_text: 'Manufacturing business in Mumbai with 30 Cr revenue',
        similarity: 0.70,
        fraud_flags: null,
        quality_tier: 2,
        is_shell: false,
        buyer_type: null,
        inferred_buyer_type: null,
        advisor_name: null,
        contact_phone: null,
        created_at: new Date().toISOString(),
      };

      const hardCheck = applyHardRejections(detailedSource, legacyCandidate);
      expect(hardCheck.rejected).toBe(false);

      const score = calculateV2Score(detailedSource, legacyCandidate);
      expect(score.finalScore).toBeGreaterThanOrEqual(60);
    });
  });
});
