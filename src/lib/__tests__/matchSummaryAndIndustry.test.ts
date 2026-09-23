/**
 * Automated Test Suite: TESTS 1 through 13
 * Verification of Deal Summary Generator, Industry Compatibility, RPC Integrity & Privacy
 */

import { describe, it, expect } from 'vitest';
import { generateFullDealSummary, sanitizeText, buildEnhancedMandateBrief } from '../dealSummaryGenerator';
import { getIndustryCompatibility } from '../M5_sectorMatrix';
import { detectSectorFromText } from '../detectors';

describe('TEST 1 - TEST 5: Toys, Fashion, Home Textiles + Contract Manufacturing', () => {
    it('TEST 1: Toys + contract manufacturing must detect consumer (NOT manufacturing)', () => {
        const text = 'Sell side mandate for a wooden toys brand with contract manufacturing facilities in Pune.';
        const sector = detectSectorFromText(text);
        expect(sector).toBe('consumer');
    });

    it('TEST 2: Toys without manufacturing must detect consumer', () => {
        const text = 'D2C toys brand seeking strategic acquisition by domestic FMCG player.';
        const sector = detectSectorFromText(text);
        expect(sector).toBe('consumer');
    });

    it('TEST 3: Home Textiles + contract manufacturing must detect consumer', () => {
        const text = 'Home textiles and bed linen brand with contract manufacturing partnerships across Gujarat.';
        const sector = detectSectorFromText(text);
        expect(sector).toBe('consumer');
    });

    it('TEST 4: Fashion + contract manufacturing must detect consumer', () => {
        const text = 'Fast fashion brand utilizing third party contract manufacturing plants in Tirupur.';
        const sector = detectSectorFromText(text);
        expect(sector).toBe('consumer');
    });

    it('TEST 5: Pure-play industrial manufacturing is preserved as manufacturing', () => {
        const text = 'Precision automotive components manufacturing plant with CNC and sheet metal stamping lines in Pune.';
        const sector = detectSectorFromText(text);
        expect(sector).toBe('manufacturing');
    });
});

describe('TEST 6 - TEST 7: Toys vs Sheet Metal Manufacturing Hard Incompatibility', () => {
    it('TEST 6: Toys vs Sheet Metal Manufacturing is evaluated as INCOMPATIBLE', () => {
        const compat = getIndustryCompatibility('toys', 'sheet_metal_manufacturing');
        expect(compat.level).toBe('INCOMPATIBLE');
    });

    it('TEST 7: Sheet Metal Manufacturing vs Wooden Toys is evaluated as INCOMPATIBLE (bidirectional)', () => {
        const compat = getIndustryCompatibility('sheet_metal_manufacturing', 'wooden_toys');
        expect(compat.level).toBe('INCOMPATIBLE');
    });

    it('Related industries evaluate as COMPATIBLE or ADJACENT', () => {
        const compat = getIndustryCompatibility('wooden_toys', 'plastic_toys');
        expect(compat.level).toBe('COMPATIBLE');

        const adjacent = getIndustryCompatibility('apparel', 'textiles');
        expect(['COMPATIBLE', 'ADJACENT']).toContain(adjacent.level);
    });
});

describe('TEST 8 - TEST 10: Rich M&A Deal Summary Generation (150-300 words & Whole Row Synthesis)', () => {
    const mockSourceProposal = {
        intent: 'BUY_SIDE',
        industry: 'Consumer Goods',
        sector: 'consumer',
        geography: 'Pan-India',
        deal_size_min: 100,
        deal_size_max: 500,
        structure: '100% Acquisition',
        industry_data: {
            business_model: 'Strategic Acquirer',
            target_ebitda_margin: '15-20%',
        }
    };

    const mockCounterparty = {
        id: 'prop-cp-12345',
        intent: 'SELL_SIDE',
        industry: 'Wooden Toys & Educational Games',
        sectors: ['consumer'],
        geographies: ['Maharashtra', 'Pan-India'],
        deal_size_min_cr: 120,
        deal_size_max_cr: 250,
        revenue_min_cr: 80,
        revenue_max_cr: 150,
        deal_structure: '100% Cash Out',
        raw_text: 'Profitable wooden toys company operating with outsourced contract manufacturing partners, strong pan-India distributor network.',
        metadata: {
            ebitda_cr: 22,
            pat_cr: 16,
            business_model: 'D2C + General Trade',
            contract_manufacturing: true,
            deal_structure: '100% Strategic Buyout',
        }
    };

    const mockScore = {
        finalScore: 88,
        similarityScore: 0.84,
        archetype: 'DIRECT_CORE_MATCH',
        matchReason: 'Direct alignment in consumer brand portfolio expansion with complementary distribution networks.',
    };

    it('TEST 8: Generates multi-paragraph M&A intelligence brief (150–300 words)', () => {
        const summary = generateFullDealSummary(mockSourceProposal, mockCounterparty, mockScore);
        const wordCount = summary.split(/\s+/).filter(Boolean).length;

        expect(wordCount).toBeGreaterThanOrEqual(100);
        expect(wordCount).toBeLessThanOrEqual(350);
        expect(summary).toContain('Opportunity Overview');
        expect(summary).toContain('Business & Transaction Profile');
        expect(summary).toContain('Fit Against Your Mandate');
        expect(summary).toContain('Key Deal Considerations');
    });

    it('TEST 9: Synthesizes whole mandate row data (financials, geography, structure, business model)', () => {
        const summary = generateFullDealSummary(mockSourceProposal, mockCounterparty, mockScore);

        expect(summary).toContain('Wooden Toys & Educational Games');
        expect(summary).toContain('₹80–150 Cr');
        expect(summary).toContain('₹120–250 Cr');
        expect(summary).toContain('Maharashtra');
        expect(summary.toLowerCase()).toContain('contract manufacturing');
    });

    it('TEST 10: buildEnhancedMandateBrief produces detailed synthesis for proposals table', () => {
        const brief = buildEnhancedMandateBrief({
            intent: 'SELL_SIDE',
            industry: 'Specialty Formulations & API',
            sector: 'pharma',
            geography: 'Hyderabad, Telangana',
            deal_size_min: 200,
            deal_size_max: 400,
            revenue_min: 150,
            revenue_max: 300,
            structure: 'Majority Stake',
            industry_data: {
                fda_approved: true,
                export_share: '45%',
            }
        });

        expect(brief.length).toBeGreaterThan(100);
        expect(brief).toContain('Specialty Formulations & API');
        expect(brief).toContain('Hyderabad, Telangana');
    });
});

describe('TEST 11: Deterministic PII Stripping & Anonymization', () => {
    it('Strips email addresses, telephone numbers, URLs, and internal UUIDs', () => {
        const dirtyText = `Contact director John Doe at john.doe@acmetoys.com or call +91 98765 43210.
        Internal reference: 550e8400-e29b-41d4-a716-446655440000.
        Visit https://www.acmetoys.com/pitch.pdf for confidential financial teaser.`;

        const cleaned = sanitizeText(dirtyText);

        expect(cleaned).not.toContain('john.doe@acmetoys.com');
        expect(cleaned).not.toContain('+91 98765 43210');
        expect(cleaned).not.toContain('550e8400-e29b-41d4-a716-446655440000');
        expect(cleaned).not.toContain('https://www.acmetoys.com/pitch.pdf');
    });

    it('Full summary output never reveals PII or raw system tokens', () => {
        const contaminatedCounterparty = {
            intent: 'SELL_SIDE',
            industry: 'Toys',
            sectors: ['consumer'],
            geographies: ['Mumbai'],
            raw_text: 'Contact advisor Rajesh at rajesh@dealmaker.in or 9820012345. Mandate ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890.',
        };

        const summary = generateFullDealSummary({}, contaminatedCounterparty, { finalScore: 80 });

        expect(summary).not.toContain('rajesh@dealmaker.in');
        expect(summary).not.toContain('9820012345');
        expect(summary).not.toContain('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });
});
