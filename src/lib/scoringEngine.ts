// src/lib/scoringEngine.ts
/**
 * DealCollab — Scoring & Validation Engine (L5)
 * Source: DC-MATCH-001 §6.1, §7.1, §7.2
 * Pure functions. No DB, no AI, no side effects.
 */

import type { QualityTier } from './dataQuality';
import type { DealIntent, SectorKey } from './promptRouter';
import { sectorAdjacency, sectorsAreCompatible } from './sectorMatrix';

// ─────────────────────────────────────────────────────────────
// INTENT POLARITY (multi-target per §5.3 + RC4)
// ─────────────────────────────────────────────────────────────

export const INTENT_FLIP: Record<NonNullable<DealIntent>, string[]> = {
    BUY_SIDE: ['SELL_SIDE'],
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
}

export interface ScoreBreakdown {
    cosine: number;
    keyword: number;
    bonus: number;
    final: number;
    sector_overlap: number;
    geo_match: 'exact' | 'partial' | 'pan_india' | 'none';
    structure_match: boolean;
    size_overlap: boolean;
    tier_bonus_applied: number;
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

    const qMid = midpoint(query.deal_size_min_cr, query.deal_size_max_cr) ?? midpoint(query.revenue_min_cr, query.revenue_max_cr);
    const cMid = midpoint(cand.deal_size_min_cr, cand.deal_size_max_cr) ?? midpoint(cand.revenue_min_cr, cand.revenue_max_cr);
    if (qMid != null && cMid != null && qMid > 0 && cMid > 0) {
        const ratio = qMid > cMid ? qMid / cMid : cMid / qMid;
        if (ratio > 10) return { passes: false, reason: `HR-2: size ratio ${ratio.toFixed(1)}× > 10×` };
    }

    if (!structureCompatible(query.structure, cand.deal_structure)) {
        return { passes: false, reason: `HR-3: structure ${query.structure} ≠ ${cand.deal_structure}` };
    }

    if (!sectorsAreCompatible(query.sector, cand.sectors)) {
        return { passes: false, reason: `HR-4: sectors incompatible` };
    }

    return { passes: true };
}

// ─────────────────────────────────────────────────────────────
// COMPOSITE SCORE
// ─────────────────────────────────────────────────────────────

function computeKeywordScore(query: ScoringQuery, cand: ScoringCandidate) {
    let kw = 0;
    let sectorOverlap = 0;
    let geoMatch: GeoMatchLevel = 'none';
    let structureMatch = false;
    let sizeOverlap = false;
    let tierBonus = 0;

    if (query.sector && cand.sectors && cand.sectors.length > 0) {
        const cSectors = cand.sectors.map(s => s.toLowerCase());
        if (cSectors.includes(query.sector)) {
            sectorOverlap = 1;
        } else {
            const adj = sectorAdjacency(query.sector, cSectors[0]);
            if (adj === 'adjacent') sectorOverlap = 0.5;
        }
        kw += 0.40 * sectorOverlap;
    }

    geoMatch = geoMatchLevel(query.geography, cand.geographies);
    if (geoMatch === 'exact') kw += 0.30;
    else if (geoMatch === 'partial') kw += 0.15;
    else if (geoMatch === 'pan_india') kw += 0.10;

    if (query.structure && cand.deal_structure &&
        query.structure.toLowerCase() === cand.deal_structure.toLowerCase()) {
        structureMatch = true;
        kw += 0.15;
    }

    if (cand.quality_tier === 1) { tierBonus = 0.10; kw += tierBonus; }
    else if (cand.quality_tier === 2) { tierBonus = 0.05; kw += tierBonus; }

    if (rangesOverlap(query.deal_size_min_cr, query.deal_size_max_cr,
        cand.deal_size_min_cr, cand.deal_size_max_cr)) {
        sizeOverlap = true;
        kw += 0.05;
    }

    return {
        total: Math.min(kw, 1.0),
        sector_overlap: sectorOverlap,
        geo_match: geoMatch,
        structure_match: structureMatch,
        size_overlap: sizeOverlap,
        tier_bonus: tierBonus,
    };
}

function computeSoftBonuses(query: ScoringQuery, cand: ScoringCandidate): number {
    let bonus = 0;

    if (query.sector && cand.sectors?.map(s => s.toLowerCase()).includes(query.sector)) bonus += 0.15; // SB-1
    const geo = geoMatchLevel(query.geography, cand.geographies);
    if (geo === 'exact') bonus += 0.12;        // SB-2
    else if (geo === 'partial') bonus += 0.06; // SB-3
    if (query.structure && cand.deal_structure &&
        query.structure.toLowerCase() === cand.deal_structure.toLowerCase()) bonus += 0.08; // SB-4
    if (rangesOverlapWithin(2, query, cand)) bonus += 0.10; // SB-5
    if (cand.quality_tier === 1) bonus += 0.05; // SB-6

    const qSpecial = new Set((query.special_conditions || []).map(s => s.toUpperCase()));
    const cSpecial = new Set((cand.special_conditions || []).map(s => s.toUpperCase()));
    const overlap = [...qSpecial].filter(s => cSpecial.has(s)).length;
    bonus += 0.04 * overlap; // SB-7

    const created = new Date(cand.created_at).getTime();
    const daysOld = (Date.now() - created) / (1000 * 60 * 60 * 24);
    if (daysOld < 30) bonus += 0.03; // SB-8

    return bonus;
}

export function computeCompositeScore(query: ScoringQuery, cand: ScoringCandidate): ScoreBreakdown {
    const cosine = cand.similarity;
    const kw = computeKeywordScore(query, cand);
    const bonus = computeSoftBonuses(query, cand);
    const effectiveCosine = cand.quality_tier === 2 ? cosine * 0.7 : cosine;
    const final = Math.min(1.0, Math.max(0, 0.65 * effectiveCosine + 0.35 * kw.total + bonus));

    return {
        cosine,
        keyword: kw.total,
        bonus,
        final,
        sector_overlap: kw.sector_overlap,
        geo_match: kw.geo_match,
        structure_match: kw.structure_match,
        size_overlap: kw.size_overlap,
        tier_bonus_applied: kw.tier_bonus,
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

export type MatchLabel = 'High' | 'Good' | 'Possible';

export function labelFor(score: number): MatchLabel {
    if (score > 0.78) return 'High';
    if (score > 0.62) return 'Good';
    return 'Possible';
}

export const MIN_SURFACE_SCORE = 0.50;

function titleCase(s: string): string {
    return s.replace(/\b\w/g, c => c.toUpperCase());
}

export function buildExplanation(query: ScoringQuery, cand: ScoringCandidate, score: ScoreBreakdown): string {
    const parts: string[] = [];
    if (score.sector_overlap === 1 && query.sector) parts.push(`Sector alignment on ${titleCase(query.sector)}`);
    else if (score.sector_overlap > 0 && query.sector) parts.push(`Adjacent sector match`);
    if (score.geo_match === 'exact' && query.geography) parts.push(`Location match in ${titleCase(query.geography)}`);
    else if (score.geo_match === 'partial') parts.push(`Same region`);
    else if (score.geo_match === 'pan_india') parts.push(`Pan-India coverage`);
    if (score.size_overlap) parts.push(`Size within compatible range`);
    if (score.structure_match) parts.push(`Compatible deal structure`);
    if (cand.quality_tier === 1) parts.push(`Verified mandate`);
    if (parts.length === 0) parts.push(`Semantic similarity match`);
    return parts.join('. ') + '.';
}