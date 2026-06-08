// src/lib/scoringEngine.ts
/**
 * DealCollab — Scoring & Validation Engine (L5)
 * Source: DC-MATCH-001 §6.1, §7.1, §7.2
 * Pure functions. No DB, no AI, no side effects.
 */

import type { QualityTier } from './dataQuality';
import {
    isShellCompany,
    isSectorLegitimate,
    shellCompanyScore,
    isHardExcluded,
    digitalMarketingRelevanceScore,
    operationalRichnessScore,
} from './dataQuality';
import type { DealIntent, SectorKey } from './promptRouter';
import { sectorAdjacency, sectorsAreCompatible } from './sectorMatrix';

// ─────────────────────────────────────────────────────────────
// INTENT POLARITY (multi-target per §5.3 + RC4)
// ─────────────────────────────────────────────────────────────

export const INTENT_FLIP: Record<NonNullable<DealIntent>, string[]> = {
    BUY_SIDE: ['SELL_SIDE', 'FUNDRAISING'],
    SELL_SIDE: ['BUY_SIDE'],
    FUNDRAISING: ['BUY_SIDE'],
    DEBT: ['DEBT'],
    STRATEGIC_PARTNERSHIP: ['STRATEGIC_PARTNERSHIP'],
};

export function getCounterpartyIntents(intent: DealIntent): string[] {
    if (!intent) return [];
    return INTENT_FLIP[intent] || [];
}

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface ScoringQuery {
    intent: DealIntent;
    sector: SectorKey | null;
    sub_sector: string | null;
    geography: string | null;
    deal_size_min_cr: number | null;
    deal_size_max_cr: number | null;
    revenue_min_cr: number | null;
    revenue_max_cr: number | null;
    structure: string | null;
    special_conditions: string[];
}

export interface ScoringCandidate {
    id: string;
    intent: string;
    sectors: string[] | null;
    geographies: string[] | null;
    deal_size_min_cr: number | null;
    deal_size_max_cr: number | null;
    revenue_min_cr: number | null;
    revenue_max_cr: number | null;
    deal_structure: string | null;
    special_conditions: string[] | null;
    quality_tier: QualityTier;
    status: string;
    similarity: number;
    contact_phone: string | null;
    advisor_name: string | null;
    created_at: string;
    raw_text: string | null;          // Used for HR-6 shell company detection
    normalised_text: string | null;   // Fallback for shell detection
    sub_sector?: string | null;
}

export interface ScoreBreakdown {
    cosine: number;
    keyword: number;          // compat alias → sector_score
    bonus: number;            // compat alias → revenue_score
    final: number;
    sector_overlap: number;
    geo_match: 'exact' | 'partial' | 'pan_india' | 'none';
    structure_match: boolean;
    size_overlap: boolean;
    tier_bonus_applied: number;
    // v2 scoring dimensions (spec: 40/25/15/10/10)
    sector_score: number;
    revenue_score: number;
    geo_score: number;
    strategic_score: number;
    shell_penalty: number;          // multiplier applied (1.0 = no penalty; <1 = penalized)
    operational_richness: number;   // 0–1 content richness of the candidate
}

// ─────────────────────────────────────────────────────────────
// GEOGRAPHY
// ─────────────────────────────────────────────────────────────

const CITY_TO_STATE: Record<string, string> = {
    'mumbai': 'maharashtra', 'pune': 'maharashtra', 'thane': 'maharashtra',
    'nashik': 'maharashtra', 'nagpur': 'maharashtra',
    'ahmedabad': 'gujarat', 'surat': 'gujarat', 'baroda': 'gujarat',
    'vadodara': 'gujarat', 'rajkot': 'gujarat',
    'delhi': 'delhi-ncr', 'noida': 'delhi-ncr', 'gurgaon': 'delhi-ncr',
    'gurugram': 'delhi-ncr', 'faridabad': 'delhi-ncr',
    'bangalore': 'karnataka', 'bengaluru': 'karnataka', 'mysore': 'karnataka',
    'chennai': 'tamil-nadu', 'coimbatore': 'tamil-nadu', 'madurai': 'tamil-nadu',
    'hyderabad': 'telangana',
    'kolkata': 'west-bengal', 'calcutta': 'west-bengal',
    'jaipur': 'rajasthan', 'jodhpur': 'rajasthan',
};

const PAN_INDIA_TOKENS = ['pan india', 'pan-india', 'all india', 'all-india', 'anywhere', 'any location'];

function geoToCanonical(g: string): string {
    return g.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isPanIndia(g: string | null): boolean {
    if (!g) return false;
    const c = geoToCanonical(g);
    return PAN_INDIA_TOKENS.some(t => c.includes(t));
}

function sameStateOrAdjacent(q: string, c: string): boolean {
    const qc = geoToCanonical(q);
    const cc = geoToCanonical(c);
    const qState = CITY_TO_STATE[qc] || qc;
    const cState = CITY_TO_STATE[cc] || cc;
    return qState === cState;
}

type GeoMatchLevel = 'exact' | 'partial' | 'pan_india' | 'none';

function geoMatchLevel(qGeo: string | null, cGeos: string[] | null): GeoMatchLevel {
    if (!qGeo || !cGeos || cGeos.length === 0) return 'none';
    if (isPanIndia(qGeo) || cGeos.some(isPanIndia)) return 'pan_india';
    const qc = geoToCanonical(qGeo);
    if (cGeos.some(c => geoToCanonical(c) === qc)) return 'exact';
    if (cGeos.some(c => sameStateOrAdjacent(qGeo, c))) return 'partial';
    return 'none';
}

// ─────────────────────────────────────────────────────────────
// SIZE OVERLAP
// ─────────────────────────────────────────────────────────────

function midpoint(min: number | null, max: number | null): number | null {
    if (min == null && max == null) return null;
    if (min == null) return max!;
    if (max == null) return min;
    return (min + max) / 2;
}

function rangesOverlap(
    aMin: number | null, aMax: number | null,
    bMin: number | null, bMax: number | null,
): boolean {
    if (aMin == null || aMax == null || bMin == null || bMax == null) return false;
    return aMin <= bMax && bMin <= aMax;
}

function rangesOverlapWithin(factor: number, q: ScoringQuery, c: ScoringCandidate): boolean {
    const qMid = midpoint(q.deal_size_min_cr ?? q.revenue_min_cr, q.deal_size_max_cr ?? q.revenue_max_cr);
    const cMid = midpoint(c.deal_size_min_cr ?? c.revenue_min_cr, c.deal_size_max_cr ?? c.revenue_max_cr);
    if (qMid == null || cMid == null) return false;
    const ratio = qMid > cMid ? qMid / cMid : cMid / qMid;
    return ratio <= factor;
}

// ─────────────────────────────────────────────────────────────
// HARD RULES (HR-1..HR-5; HR-6 in applyAdvisorCap)
// ─────────────────────────────────────────────────────────────

export interface RejectionResult {
    passes: boolean;
    reason?: string;
}

const STRUCTURE_COMPAT: Record<string, string[]> = {
    'full sale': ['full sale', 'majority stake', '100%', 'acquisition'],
    'majority stake': ['full sale', 'majority stake', 'acquisition'],
    'minority stake': ['minority stake', 'investment', 'equity'],
    'asset sale': ['asset sale', 'slump sale'],
    'slump sale': ['asset sale', 'slump sale'],
    '100%': ['full sale', 'majority stake', '100%', 'acquisition'],
    'acquisition': ['full sale', 'majority stake', '100%', 'acquisition'],
    'investment': ['minority stake', 'investment', 'equity', 'fundraising'],
    'fundraising': ['minority stake', 'investment', 'fundraising'],
    'equity': ['minority stake', 'investment', 'equity'],
};

function structureCompatible(qStruct: string | null, cStruct: string | null): boolean {
    if (!qStruct || !cStruct) return true;
    const q = qStruct.toLowerCase().trim();
    const c = cStruct.toLowerCase().trim();
    if (q === c) return true;
    const allowed = STRUCTURE_COMPAT[q];
    if (!allowed) return true;
    return allowed.includes(c);
}

export function passesHardRules(query: ScoringQuery, cand: ScoringCandidate): RejectionResult {
    if (cand.status !== 'ACTIVE') return { passes: false, reason: `HR-5: status=${cand.status}` };

    // HR-2: Size ratio check — directional.
    // A large BUY_SIDE with a big budget can absolutely acquire a smaller target,
    // so we only block if the SELLER is far larger than the BUYER'S budget.
    const qMid = midpoint(query.deal_size_min_cr, query.deal_size_max_cr) ?? midpoint(query.revenue_min_cr, query.revenue_max_cr);
    const cMid = midpoint(cand.deal_size_min_cr, cand.deal_size_max_cr) ?? midpoint(cand.revenue_min_cr, cand.revenue_max_cr);
    if (qMid != null && cMid != null && qMid > 0 && cMid > 0) {
        if (query.intent === 'BUY_SIDE') {
            // Block only if seller's ask is more than 5× the buyer's budget
            if (cMid > qMid * 5) return { passes: false, reason: `HR-2: seller ask ${cMid} Cr >> buyer budget ${qMid} Cr` };
        } else {
            // For other intents, keep the original symmetric 10× cap
            const ratio = qMid > cMid ? qMid / cMid : cMid / qMid;
            if (ratio > 10) return { passes: false, reason: `HR-2: size ratio ${ratio.toFixed(1)}× > 10×` };
        }
    }

    if (!structureCompatible(query.structure, cand.deal_structure)) {
        return { passes: false, reason: `HR-3: structure ${query.structure} ≠ ${cand.deal_structure}` };
    }

    if (!sectorsAreCompatible(query.sector, cand.sectors)) {
        return { passes: false, reason: `HR-4: sectors incompatible` };
    }

    const textToCheck = cand.raw_text || cand.normalised_text || '';

    // HR-6: Shell company detection — reject dormant/paper companies with zero turnover,
    // ₹1-10L capital, INC-20A filings, or "Company for sell:- Year: ..." template posts.
    if (textToCheck && isShellCompany(textToCheck)) {
        if (query.sub_sector?.toLowerCase() !== 'shell_company') {
            return { passes: false, reason: `HR-6: shell/dormant company detected` };
        }
    }

    // HR-7: Sector legitimacy — reject candidates whose text contradicts their claimed sector.
    if (query.sector && cand.sectors && cand.sectors.length > 0 && textToCheck) {
        const claimedSector = cand.sectors[0];
        if (!isSectorLegitimate(claimedSector, textToCheck)) {
            return { passes: false, reason: `HR-7: claimed sector '${claimedSector}' contradicted by company description` };
        }
    }

    // HR-8: Hard exclusion — GST-for-sale, trademark-for-sale, dormant/inactive entities, SPVs.
    // These are compliance/paper entities, not operating businesses.
    // Exempt ONLY when user explicitly requests a shell company / dormant entity / SPV.
    const exemptFromHardExclusion = query.sub_sector?.toLowerCase() === 'shell_company';
    if (!exemptFromHardExclusion && textToCheck && isHardExcluded(textToCheck)) {
        return { passes: false, reason: `HR-8: Hard exclusion — compliance/dormant/shell asset detected` };
    }

    // HR-9: Digital marketing sub-sector filter.
    // A generic SaaS-tagged company with zero marketing operational content MUST NOT
    // appear when the query is specifically for digital marketing / MarTech.
    if (query.sub_sector === 'digital_marketing' && textToCheck) {
        const dmScore = digitalMarketingRelevanceScore(textToCheck);
        if (dmScore < 0.34) {   // requires at least 1 of 3 operational signals
            return { passes: false, reason: `HR-9: Digital marketing query — candidate has no marketing operational content (score: ${dmScore.toFixed(2)})` };
        }
    }

    // HR-10: Skeleton proposal gate — extremely low operational content combined with
    // any shell indicators. Prevents boilerplate ROC-data dumps from reaching ranking.
    if (textToCheck) {
        const richness = operationalRichnessScore(textToCheck);
        const sScore = shellCompanyScore(textToCheck);
        if (richness < 0.12 && sScore >= 20) {
            return { passes: false, reason: `HR-10: Skeleton proposal — operational richness ${richness.toFixed(2)}, shell score ${sScore}` };
        }
    }

    return { passes: true };
}

// ─────────────────────────────────────────────────────────────
// COMPOSITE SCORE
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// V2 SCORING HELPERS (spec: 40% sector / 25% business model / 15% geo / 10% strategic / 10% revenue)
// ─────────────────────────────────────────────────────────────

function scoreSector(query: ScoringQuery, cand: ScoringCandidate): { score: number; overlap: number } {
    if (!query.sector || !cand.sectors?.length) return { score: 0, overlap: 0 };
    const cSectors = cand.sectors.map(s => s.toLowerCase());
    let base = 0;
    if (cSectors.includes(query.sector)) base = 1.0;
    else {
        const adj = sectorAdjacency(query.sector, cSectors[0]);
        if (adj === 'adjacent') base = 0.5;
    }
    if (base === 0) return { score: 0, overlap: 0 };
    // Sub-sector exact-match bonus: +0.20, capped at 1.0
    const qSub = query.sub_sector?.toLowerCase();
    const cSub = cand.sub_sector?.toLowerCase();
    if (qSub && cSub && qSub === cSub) {
        base = Math.min(1.0, base + 0.20);
    }
    return { score: base, overlap: base >= 1 ? 1 : 0.5 };
}

function scoreRevenue(query: ScoringQuery, cand: ScoringCandidate): number {
    const qHasSize = query.deal_size_min_cr != null || query.deal_size_max_cr != null
        || query.revenue_min_cr != null || query.revenue_max_cr != null;
    const cHasSize = cand.deal_size_min_cr != null || cand.deal_size_max_cr != null
        || cand.revenue_min_cr != null || cand.revenue_max_cr != null;

    // If either side has no size/revenue data, we can't penalise — return neutral 0.5.
    // This prevents BUY_SIDE deal_size vs SELL_SIDE revenue from scoring 0 when the
    // DB field names differ (BUY stores deal_size; SELL stores revenue_min_cr).
    if (!qHasSize || !cHasSize) return 0.5;

    // Cross-field comparison: treat BUY deal_size against SELL revenue (and vice versa)
    const qMin = query.deal_size_min_cr ?? query.revenue_min_cr;
    const qMax = query.deal_size_max_cr ?? query.revenue_max_cr;
    const cMin = cand.deal_size_min_cr ?? cand.revenue_min_cr;
    const cMax = cand.deal_size_max_cr ?? cand.revenue_max_cr;

    if (rangesOverlap(qMin, qMax, cMin, cMax)) return 1.0;
    if (rangesOverlapWithin(2, query, cand)) return 0.5;
    return 0.1;    // both have data but ranges don't overlap — penalise but don't zero out
}

function scoreGeo(query: ScoringQuery, cand: ScoringCandidate): { score: number; level: GeoMatchLevel } {
    const level = geoMatchLevel(query.geography, cand.geographies);
    const score = level === 'exact' ? 1.0 : level === 'partial' ? 0.5 : level === 'pan_india' ? 0.3 : 0;
    return { score, level };
}

function scoreStrategic(query: ScoringQuery, cand: ScoringCandidate): { score: number; structMatch: boolean } {
    const structMatch = structureCompatible(query.structure, cand.deal_structure) &&
        !!(query.structure && cand.deal_structure);
    // quality_tier is stored as text in the DB ('1','2','3','4'); coerce to number
    const tier = typeof cand.quality_tier === 'string'
        ? parseInt(cand.quality_tier as unknown as string, 10)
        : (cand.quality_tier as unknown as number);
    let score = 0;
    if (structMatch) score += 0.5;
    if (tier === 1) score += 0.5;
    else if (tier === 2) score += 0.25;
    return { score: Math.min(1.0, score), structMatch };
}

export function computeCompositeScore(query: ScoringQuery, cand: ScoringCandidate): ScoreBreakdown {
    const cosine = cand.similarity;                         // business model proxy (25%)
    const { score: sectorScore, overlap: sectorOverlap } = scoreSector(query, cand);  // 40%
    const revenueScore = scoreRevenue(query, cand);         // 10%
    const { score: geoScore, level: geoMatch } = scoreGeo(query, cand);               // 15%
    const { score: strategicScore, structMatch } = scoreStrategic(query, cand);        // 10%

    const rawScore = 0.40 * sectorScore +
        0.25 * cosine +
        0.15 * geoScore +
        0.10 * strategicScore +
        0.10 * revenueScore;

    // Shell penalty: dormant/compliance companies cannot score high even with good sector/geo tags.
    // A real operating business has no shell signals so shellPenalty stays at 1.0.
    const textToCheck = cand.raw_text || cand.normalised_text || '';
    const sScore = textToCheck ? shellCompanyScore(textToCheck) : 0;
    const opRichness = textToCheck ? operationalRichnessScore(textToCheck) : 0.5;
    let shellPenalty = 1.0;
    if (sScore >= 70) shellPenalty = 0.40;   // High shell risk → 60% reduction
    else if (sScore >= 40) shellPenalty = 0.65; // Moderate shell risk → 35% reduction
    // Also penalize severely thin content (boilerplate-only proposals that slipped HR-10)
    else if (opRichness < 0.20) shellPenalty = 0.75;

    const final = Math.min(1.0, Math.max(0, rawScore * shellPenalty));

    return {
        cosine,
        keyword: sectorScore,           // compat alias
        bonus: revenueScore,            // compat alias
        final,
        sector_overlap: sectorOverlap,
        geo_match: geoMatch,
        structure_match: structMatch,
        size_overlap: revenueScore >= 1,
        tier_bonus_applied: strategicScore,
        sector_score: sectorScore,
        revenue_score: revenueScore,
        geo_score: geoScore,
        strategic_score: strategicScore,
        shell_penalty: shellPenalty,
        operational_richness: opRichness,
    };
}

// ─────────────────────────────────────────────────────────────
// HR-6: ADVISOR CAP
// ─────────────────────────────────────────────────────────────

export interface ScoredMatch {
    proposal_id: string;
    contact_phone: string | null;
    advisor_name: string | null;
    score: ScoreBreakdown;
    candidate: ScoringCandidate;
}

export function applyAdvisorCap(matches: ScoredMatch[], cap = 2): ScoredMatch[] {
    const seen = new Map<string, number>();
    const out: ScoredMatch[] = [];
    const sorted = [...matches].sort((a, b) => b.score.final - a.score.final);
    for (const m of sorted) {
        const key = m.contact_phone?.trim()
            || m.advisor_name?.trim().toLowerCase()
            || `solo_${m.proposal_id}`;
        const n = seen.get(key) || 0;
        if (n >= cap) continue;
        seen.set(key, n + 1);
        out.push(m);
    }
    return out;
}

// ─────────────────────────────────────────────────────────────
// LABELS + EXPLANATIONS
// ─────────────────────────────────────────────────────────────

export type MatchLabel = 'VERIFIED_MATCH' | 'HIGH_CONFIDENCE';

export function labelFor(score: number): MatchLabel {
    if (score > 0.85) return 'VERIFIED_MATCH';
    return 'HIGH_CONFIDENCE';   // 0.75–0.85 (below 0.75 filtered by MIN_SURFACE_SCORE)
}

// Raised from 0.70 → 0.75: data quality issues in the corpus require higher precision bar
export const MIN_SURFACE_SCORE = 0.75;

function titleCase(s: string): string {
    return s.replace(/\b\w/g, c => c.toUpperCase());
}

export interface MatchExplanation {
    reason: string;
    sectorFit: string;
    revenueFit: string;
    strategicFit: string;
    geographyFit: string;
    riskFlags: string[];
}

export function computeRiskFlags(query: ScoringQuery, cand: ScoringCandidate, score: ScoreBreakdown): string[] {
    const flags: string[] = [];

    // Shell / dormant risk (derived from the penalty already applied to the score)
    if (score.shell_penalty <= 0.45) flags.push(`High shell risk — possible dormant/inactive entity`);
    else if (score.shell_penalty <= 0.70) flags.push(`Shell risk — limited operational data detected`);

    // Low content / boilerplate warning
    if (score.operational_richness < 0.25) flags.push('Thin description — operational details are minimal');

    if (score.sector_score === 0 && query.sector) {
        flags.push(`Sector mismatch — mandate is ${query.sector}, candidate differs`);
    }

    if (score.revenue_score === 0.5 && cand.deal_size_min_cr == null && cand.revenue_min_cr == null) {
        flags.push('Revenue undisclosed — financial compatibility unverified');
    }

    if (score.geo_match === 'none' && query.geography) {
        flags.push(`Geography mismatch — mandate requires ${query.geography}`);
    }

    const tier = typeof cand.quality_tier === 'string'
        ? parseInt(cand.quality_tier as unknown as string, 10)
        : (cand.quality_tier as unknown as number);
    if (tier === 4) flags.push('Low-quality mandate — minimal details provided');
    else if (tier === 3) flags.push('Incomplete mandate — some details missing');

    return flags;
}

export function buildExplanation(query: ScoringQuery, cand: ScoringCandidate, score: ScoreBreakdown): MatchExplanation {
    // Overall reason
    const parts: string[] = [];
    if (score.sector_score >= 1 && query.sector) parts.push(`Exact sector match on ${titleCase(query.sector)}`);
    else if (score.sector_score > 0 && query.sector) parts.push(`Adjacent sector — ${titleCase(query.sector)}-adjacent`);
    if (score.geo_match === 'exact' && query.geography) parts.push(`Same geography (${titleCase(query.geography)})`);
    else if (score.geo_match === 'partial') parts.push(`Same region`);
    else if (score.geo_match === 'pan_india') parts.push(`Pan-India coverage`);
    if (score.revenue_score >= 1) parts.push(`Revenue scale compatible`);
    if (score.structure_match) parts.push(`Deal structure aligned`);
    if (cand.quality_tier === 1) parts.push(`Tier 1 verified mandate`);
    if (parts.length === 0) parts.push(`Semantic business profile match`);
    const reason = parts.join('. ') + '.';

    const sectorFit = score.sector_score >= 1
        ? `Strong — exact ${query.sector ?? 'sector'} match`
        : score.sector_score > 0
        ? `Moderate — adjacent sector`
        : `Weak — sector mismatch`;

    const revenueFit = score.revenue_score >= 1
        ? `Compatible — revenue/deal ranges overlap`
        : score.revenue_score > 0
        ? `Moderate — within 2× range`
        : `Undisclosed or outside range`;

    const strategicFit = score.strategic_score >= 0.75
        ? `Strong — structure aligned, verified mandate`
        : score.strategic_score >= 0.4
        ? `Moderate — structure compatible`
        : `Indicative — structure not specified`;

    const geographyFit = score.geo_match === 'exact'
        ? `Exact match — ${query.geography ?? 'same city'}`
        : score.geo_match === 'partial'
        ? `Regional match — same state/region`
        : score.geo_match === 'pan_india'
        ? `Pan-India — open to any location`
        : `No geography overlap`;

    const riskFlags = computeRiskFlags(query, cand, score);

    return { reason, sectorFit, revenueFit, strategicFit, geographyFit, riskFlags };
}