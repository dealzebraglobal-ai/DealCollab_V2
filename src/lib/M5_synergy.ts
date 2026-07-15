/**
 * DealCollab — M5: Synergy Review (deterministic, identity-safe)
 * =============================================================
 * Place at: src/lib/M5_synergy.ts
 *
 * PURE. Builds a genuine, decision-useful synergy summary for the EOI review screen from
 * REAL match data + both proposals' STRUCTURED fields only.
 *   - No LLM: no hallucination, no per-candidate cost, in-scope.
 *   - No identity: sector (enum), geography, deal-size BANDS, free-text industry
 *     (owner-ruled safe), and an alignment BAND — never a raw score number.
 * The sector rationale is pulled from the 348-deal compatibility matrix, so the comment
 * is grounded in the actual scoring, not invented.
 */

import { getSectorCompatibility } from './M5_sectorMatrix';

export interface SynergySide {
    intent: string;
    sector: string | null;       // coarse enum (e.g. 'FMCG')
    industry: string | null;     // free-text industry (owner-ruled safe to show)
    geography: string | null;
    dealMin: number | null;
    dealMax: number | null;
    revMin: number | null;
    revMax: number | null;
}

export interface SynergyReview {
    alignmentBand: 'High' | 'Moderate' | 'Exploratory';
    sectorFit: string;
    financialFit: string;
    geographyFit: string;
    industryNote: string | null;
    comment: string; // one-line fair summary
}

function bandFor(score: number): 'High' | 'Moderate' | 'Exploratory' {
    if (score >= 75) return 'High';
    if (score >= 60) return 'Moderate';
    return 'Exploratory';
}

function fmtBand(min: number | null, max: number | null): string | null {
    if (!min && !max) return null;
    if (min && max && min !== max) return `₹${min}–${max} Cr`;
    return `₹${max ?? min} Cr`;
}

function overlaps(aMin: number | null, aMax: number | null, bMin: number | null, bMax: number | null): boolean {
    const a1 = aMin ?? aMax, a2 = aMax ?? aMin, b1 = bMin ?? bMax, b2 = bMax ?? bMin;
    if (a1 == null || a2 == null || b1 == null || b2 == null) return false;
    return Math.max(a1, b1) <= Math.min(a2, b2);
}

const GEO_GROUPS = [
    ['mumbai', 'pune', 'nashik', 'nagpur', 'maharashtra', 'mh'],
    ['ahmedabad', 'surat', 'gujarat', 'rajkot', 'vadodara', 'gj'],
    ['delhi', 'noida', 'gurgaon', 'faridabad', 'ncr', 'new delhi'],
    ['bangalore', 'bengaluru', 'mysore', 'karnataka'],
    ['hyderabad', 'telangana', 'andhra'],
    ['chennai', 'coimbatore', 'tamil nadu', 'tn'],
    ['kolkata', 'west bengal', 'wb'],
];
function sameRegion(a: string, b: string): boolean {
    const x = a.toLowerCase(), y = b.toLowerCase();
    return GEO_GROUPS.some(g => g.some(k => x.includes(k)) && g.some(k => y.includes(k)));
}

export function buildSynergyReview(source: SynergySide, cp: SynergySide, finalScore: number): SynergyReview {
    const alignmentBand = bandFor(finalScore);

    // Sector fit — genuine, from DC-KB-003 (348 real deals). First clause only, no penalty numbers.
    const comp = getSectorCompatibility(source.sector ?? '', cp.sector ?? '');
    const sectorFit = (comp.reason.split('.')[0] || 'Sector relationship assessed').trim() + '.';

    // Financial fit — band overlap (bands only, per owner ruling).
    const srcSize = fmtBand(source.dealMin, source.dealMax);
    const cpSize = fmtBand(cp.dealMin, cp.dealMax);
    let financialFit: string;
    if (srcSize && cpSize) {
        financialFit = overlaps(source.dealMin, source.dealMax, cp.dealMin, cp.dealMax)
            ? `Deal-size expectations overlap (${srcSize} vs ${cpSize}).`
            : `Deal-size expectations differ (${srcSize} vs ${cpSize}).`;
    } else {
        financialFit = 'Deal-size bands not fully disclosed on both sides.';
    }

    // Geography fit.
    let geographyFit: string;
    if (source.geography && cp.geography) {
        geographyFit =
            source.geography.toLowerCase() === cp.geography.toLowerCase() || sameRegion(source.geography, cp.geography)
                ? `Same region (${source.geography} / ${cp.geography}).`
                : `Different regions (${source.geography} vs ${cp.geography}).`;
    } else {
        geographyFit = 'Geography not disclosed on both sides.';
    }

    // Industry note (free-text, owner-ruled safe).
    let industryNote: string | null = null;
    if (source.industry && cp.industry) {
        industryNote = source.industry.toLowerCase() === cp.industry.toLowerCase()
            ? `Both operate in ${cp.industry}.`
            : `Your focus: ${source.industry}. Counterparty: ${cp.industry}.`;
    } else if (cp.industry) {
        industryNote = `Counterparty focus: ${cp.industry}.`;
    }

    const comment = `${alignmentBand} alignment. ${sectorFit} ${financialFit}${industryNote ? ' ' + industryNote : ''}`;

    return { alignmentBand, sectorFit, financialFit, geographyFit, industryNote, comment };
}