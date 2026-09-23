/**
 * DealCollab — Matchmaking Execution Engine
 * ==========================================
 * Place at: src/lib/matchmakingEngine.ts
 *
 * V2 Philosophy: "Semantic meaning is truth"
 *
 * Scoring weights:
 *   SEMANTIC   55% — cosine similarity (pgvector)
 *   INDUSTRY   25% — industry-first compatibility (DC-KB-003 via M5_sectorMatrix)
 *   FINANCIAL  10% — deal size & revenue overlap
 *   GEOGRAPHY   5% — geography match
 *   FRESHNESS   5% — recency of proposal
 *
 * Pipeline:
 *   Phase 1 — Build clean canonical normalized text (no raw conversational noise)
 *   Phase 2 — Generate OpenAI embedding for storage (actual intent)
 *   Phase 3 — Generate reversed-intent query embedding (buyer finds sellers semantically)
 *   Phase 4 — Insert proposal record to proposals table
 *   Phase 5 — Store embedding via update_proposal_embedding RPC
 *   Phase 6 — pgvector ANN search with reversed-intent query embedding (top 30)
 *   Phase 7 — Apply hard rejection rules HR-1 to HR-8 in TypeScript
 *   Phase 8 — V2 composite scoring
 *   Phase 9 — Store top 10 matches in proposal_matches
 *   Phase 10 — Return MatchCard[] for immediate frontend rendering
 */

import OpenAI from 'openai';
import { createServerSupabaseClient } from '@/utils/supabase/server';
import {
  normalizeSector,
  MATCH_ARCHETYPES,
  detectFraudSignals,
  resolveIndustryCompatibility
} from './M5_sectorMatrix';
import {
  buildReciprocalRow,
  buildBlindNotification,
  buildSavedSearchRecord,
  type MatchRow,
  type NotificationRecord
} from './M5_persistence';
import { deliverNotificationEmail, type NotificationRow } from './email/notifications/delivery';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface ProposalInput {
  mandateId?: string;
  userId: string;
  intent: string;
  raw_text: string;
  sector: string | null;
  industry?: string | null;   // Primary business identity
  sub_sector?: string | null;
  serving_sectors?: string[] | null;  // Explicit cross-sector capabilities
  geography: string | null;
  geographies?: string[] | null;
  deal_size?: string | null;
  revenue?: string | null;
  structure?: string | null;
  deal_structure?: string | null;
  intent_focus?: string | null;
  industry_data?: Record<string, unknown>;
  special_conditions?: string[];
  deal_size_min?: string | null;
  deal_size_max?: string | null;
  deal_size_min_cr?: number | string | null;
  deal_size_max_cr?: number | string | null;
  revenue_min?: string | null;
  revenue_max?: string | null;
  revenue_min_cr?: number | string | null;
  revenue_max_cr?: number | string | null;
  currency?: string | null;
  urgency?: string | null;
  buyer_type?: string | null;
  advisor_name?: string | null;
  contact_phone?: string | null;
  inferred_urgency?: string | null;
  inferred_buyer_type?: string | null;
  intent_validated?: boolean;
  is_shell_query?: boolean;   // NM5: true = include shells, false = exclude
  document_url?: string | null;   // URL of uploaded PDF/doc (if any)
  document_text?: string | null;  // Extracted text from uploaded document
  id?: string;
  source?: string;   // proposals.source — defaults to 'WEB' when omitted (chat flow)
}

export interface Candidate {
  id: string;
  user_id: string | null;
  intent: string;
  industry: string | null;
  sectors: string[] | null;
  serving_sectors: string[] | null;
  geographies: string[] | null;
  deal_size_min_cr: number | null;
  deal_size_max_cr: number | null;
  revenue_min_cr: number | null;
  revenue_max_cr: number | null;
  deal_structure: string | null;
  buyer_type: string | null;
  inferred_buyer_type: string | null;
  special_conditions?: string[] | null;
  normalised_text: string;
  raw_text?: string | null;
  similarity: number;
  advisor_name: string | null;
  contact_phone: string | null;
  fraud_flags: string[] | null;
  quality_tier: number;
  is_shell?: boolean;
  status?: string | null;
  created_at: string;
}

export interface MatchCard {
  matchedProposalId: string;
  sector: string | null;
  geography: string | null;
  sizeRange: string | null;
  finalScore: number;
  scoreLabel: 'High' | 'Good' | 'Possible';
  matchReason: string;
  archetype: string;
}

export type MatchmakingStatus =
  | 'MATCHMAKING_FAILED'
  | 'MATCHMAKING_COMPLETED_WITH_ZERO_MATCHES'
  | 'MATCHMAKING_COMPLETED_WITH_MATCHES';

export interface MatchmakingResult {
  proposalId: string;
  matchCount: number;
  topScore: number;
  cards: MatchCard[];
  summary: string;
  status: MatchmakingStatus;
  persistedCount: number;
}

// ─────────────────────────────────────────────────────────────
// INTENT REVERSAL
// ─────────────────────────────────────────────────────────────

// Single-target reverse used only for building the reversed query EMBEDDING TEXT
// (so a FUNDRAISING company's query text sounds like BUY_SIDE to attract investors)
export const REVERSE_INTENT: Record<string, string> = {
  BUY_SIDE: 'SELL_SIDE',
  SELL_SIDE: 'BUY_SIDE',
  FUNDRAISING: 'BUY_SIDE',
  DEBT: 'DEBT',
  STRATEGIC_PARTNERSHIP: 'STRATEGIC_PARTNERSHIP',
};

// Multi-target map: the actual counterparty intents the SQL should search for.
// Authoritative — mirrors scoringEngine.ts INTENT_FLIP exactly.
// Used for: (a) match_proposals RPC 'match_intents' param, (b) HR-1 check.
export const COUNTERPARTY_INTENTS: Record<string, string[]> = {
  BUY_SIDE: ['SELL_SIDE', 'FUNDRAISING'],
  SELL_SIDE: ['BUY_SIDE'],
  FUNDRAISING: ['BUY_SIDE'],
  DEBT: ['DEBT'],
  STRATEGIC_PARTNERSHIP: ['STRATEGIC_PARTNERSHIP'],
};

// ─────────────────────────────────────────────────────────────
// V2 SCORING WEIGHTS
// ─────────────────────────────────────────────────────────────

export const W = {
  SEMANTIC: 0.55,
  INDUSTRY: 0.25,
  FINANCIAL: 0.10,
  GEOGRAPHY: 0.05,
  FRESHNESS: 0.05,
} as const;

// ─────────────────────────────────────────────────────────────
// PHASE 1: CANONICAL NORMALIZED TEXT
// V2: clean structured text only — NO raw conversational noise
// ─────────────────────────────────────────────────────────────

export function buildCanonicalText(input: ProposalInput, intentOverride?: string): string {
  const parts: string[] = [];

  const intent = intentOverride ?? input.intent;
  if (intent) parts.push(intent);

  if (input.sector) {
    const canonical = normalizeSector(input.sector);
    parts.push(canonical);
    if (canonical !== input.sector.toUpperCase()) parts.push(input.sector);
  }

  // Hybrid: the TRUE free-text industry is the primary signal — embed it so semantic
  // matching keys on the real industry (e.g. "Freshwater Aquaculture"), not the coarse bucket.
  if (input.industry) parts.push(input.industry);

  if (input.serving_sectors && input.serving_sectors.length > 0) {
    parts.push(`serves: ${input.serving_sectors.join(', ')}`);
  }

  if (input.sub_sector) parts.push(input.sub_sector);
  if (input.geography) parts.push(input.geography);
  if (input.structure || input.deal_structure) parts.push(input.structure || input.deal_structure || '');
  if (input.buyer_type) parts.push(`buyer_type: ${input.buyer_type}`);
  if (input.intent_focus) parts.push(input.intent_focus);

  /**
   * Financial signal formatting.
   *
   * Why this exists:
   * - If min and max are same, show a single value.
   * - If min and max are different, show a range.
   */
  const formatCrSignal = (
    label: 'deal size' | 'revenue',
    min: number | null,
    max: number | null,
  ): string | null => {
    if (min === null && max === null) return null;

    const onlyValue = min ?? max;
    if (min === null || max === null || min === max) {
      return `${label} ${onlyValue} crore`;
    }

    return `${label} ${min} to ${max} crore`;
  };

  const formatRawFinancialSignal = (
    label: 'deal size' | 'revenue',
    raw: string | null,
  ): string | null => {
    if (!raw) return null;

    const nums = raw.match(/\d+(?:\.\d+)?/g);
    if (!nums || nums.length === 0) return null;

    if (nums.length === 1 || nums[0] === nums[1]) {
      return `${label} ${nums[0]} crore`;
    }

    return `${label} ${nums[0]} to ${nums[1]} crore`;
  };

  // Financial signals as clean tokens
  const sMin = parseNum(input.deal_size_min ?? (input.deal_size_min_cr ? String(input.deal_size_min_cr) : null));
  const sMax = parseNum(input.deal_size_max ?? (input.deal_size_max_cr ? String(input.deal_size_max_cr) : null));
  const dealSizeSignal =
    formatCrSignal('deal size', sMin, sMax) ||
    formatRawFinancialSignal('deal size', input.deal_size ?? null);

  if (dealSizeSignal) {
    parts.push(dealSizeSignal);
  }

  const rMin = parseNum(input.revenue_min ?? (input.revenue_min_cr ? String(input.revenue_min_cr) : null));
  const rMax = parseNum(input.revenue_max ?? (input.revenue_max_cr ? String(input.revenue_max_cr) : null));
  const revenueSignal =
    formatCrSignal('revenue', rMin, rMax) ||
    formatRawFinancialSignal('revenue', input.revenue ?? null);

  if (revenueSignal) {
    parts.push(revenueSignal);
  }

  // Structured industry_data only (skip narrative fields)
  const skipKeys = new Set(['company_overview', 'raw_description']);
  Object.entries(input.industry_data || {}).forEach(([k, v]) => {
    if (!skipKeys.has(k) && v && typeof v === 'string' && v.length < 120) {
      parts.push(`${k.replace(/_/g, ' ')}: ${v}`);
    }
  });

  return parts.filter(Boolean).join(' | ');
}

// ─────────────────────────────────────────────────────────────
// PHASE 2/3: EMBEDDING GENERATION
// ─────────────────────────────────────────────────────────────

export async function embed(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('[EMBEDDING] OPENAI_API_KEY not configured');
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  });
  return res.data[0].embedding;
}

// ─────────────────────────────────────────────────────────────
// PHASE 7: HARD REJECTION RULES
// HR-1 to HR-8 — any rejection = discard candidate, no score computed
// ─────────────────────────────────────────────────────────────

export function applyHardRejections(
  source: ProposalInput,
  candidate: Candidate,
): { rejected: boolean; reason?: string } {

  // HR-1: Intent polarity mismatch (multi-target aware)
  const expectedIntents = COUNTERPARTY_INTENTS[source.intent] ?? [];
  if (expectedIntents.length > 0 && !expectedIntents.includes(candidate.intent)) {
    return { rejected: true, reason: `HR-1: ${candidate.intent} not in expected [${expectedIntents.join(', ')}]` };
  }

  // HR-2: Deal size ceiling
  const sMax = parseNum(source.deal_size_max ?? (source.deal_size_max_cr ? String(source.deal_size_max_cr) : null)) ?? 0;
  const cMax = candidate.deal_size_max_cr ?? 0;
  if (sMax > 0 && cMax > 0) {
    if (source.intent === 'BUY_SIDE' && candidate.intent === 'SELL_SIDE') {
      if (cMax > sMax * 5) {
        return { rejected: true, reason: `HR-2: Seller ask ${cMax} Cr exceeds 5x buyer budget ceiling (${sMax} Cr)` };
      }
    } else {
      const ratio = Math.max(sMax, cMax) / Math.max(Math.min(sMax, cMax), 0.01);
      if (ratio > 10) {
        return { rejected: true, reason: `HR-2: Size ratio ${ratio.toFixed(0)}x exceeds 10x ceiling` };
      }
    }
  }

  // HR-3: Deal structure & Fundraising compatibility
  const src = (source.structure || source.deal_structure || '').toLowerCase();
  const cnd = (candidate.deal_structure || '').toLowerCase();

  const sourceFullAcquisition = src.includes('100%') || src.includes('full buyout') || src.includes('majority') || src.includes('acquisition') || src.includes('slump sale') || src.includes('asset sale');
  const candidateFullAcquisition = cnd.includes('100%') || cnd.includes('full buyout') || cnd.includes('majority') || cnd.includes('acquisition') || cnd.includes('slump sale') || cnd.includes('asset sale');
  const sourceFundraise = source.intent === 'FUNDRAISING' || src.includes('minority') || src.includes('fundrais') || src.includes('convertible') || src.includes('debenture') || src.includes('ccd') || src.includes('equity');
  const candidateFundraise = candidate.intent === 'FUNDRAISING' || cnd.includes('minority') || cnd.includes('fundrais') || cnd.includes('convertible') || cnd.includes('debenture') || cnd.includes('ccd') || cnd.includes('equity');

  // If source is doing a fundraise without full buyout permission:
  if (sourceFundraise && !sourceFullAcquisition) {
    if (candidateFullAcquisition || (candidate.intent === 'BUY_SIDE' && (cnd.includes('100%') || cnd.includes('majority')))) {
      return { rejected: true, reason: 'HR-3: Majority/100% buyout acquisition buyer incompatible with convertible debenture / equity fundraise' };
    }
  }

  // Symmetrically, if candidate is fundraise without full buyout permission and source is full buyout:
  if (candidateFundraise && !candidateFullAcquisition) {
    if (sourceFullAcquisition || (source.intent === 'BUY_SIDE' && (src.includes('100%') || src.includes('majority')))) {
      return { rejected: true, reason: 'HR-3: Full buyout mandate incompatible with minority fundraise / convertible debenture' };
    }
  }

  // HR-4: Industry-first compatibility
  const comp = resolveIndustryCompatibility(
    {
      industry: source.industry,
      sector: source.sector,
      sectors: source.sector ? [source.sector] : [],
      serving_sectors: source.serving_sectors,
    },
    {
      industry: candidate.industry,
      sector: candidate.sectors?.[0] ?? null,
      sectors: candidate.sectors,
      serving_sectors: candidate.serving_sectors,
    }
  );

  if (comp.level === 'INCOMPATIBLE') {
    return { rejected: true, reason: `HR-4: ${comp.reason}` };
  }

  // HR-5: Active status check
  if (candidate.status && candidate.status !== 'ACTIVE') {
    return { rejected: true, reason: 'HR-5: Candidate mandate is not ACTIVE' };
  }

  // HR-7: Shell company filtering (NM5)
  if (!source.is_shell_query && candidate.is_shell === true) {
    return { rejected: true, reason: 'HR-7: Shell proposal excluded from operational query' };
  }

  // HR-8: Fraud signal rejection
  const fraudInFlags = (candidate.fraud_flags ?? []);
  const fraudInText = detectFraudSignals(candidate.normalised_text ?? (candidate.raw_text ?? ''));
  if (fraudInFlags.length > 0 || fraudInText.length > 0) {
    return { rejected: true, reason: 'HR-8: Fraud signals detected' };
  }

  return { rejected: false };
}

// ─────────────────────────────────────────────────────────────
// PHASE 8: V2 COMPOSITE SCORING
// ─────────────────────────────────────────────────────────────

export interface ScoreResult {
  finalScore: number;
  breakdown: {
    semanticScore: number;
    industryScore: number;
    financialScore: number;
    geoScore: number;
    freshnessScore: number;
  };
  matchReason: string;
  archetype: string;
}

export function calculateV2Score(source: ProposalInput, candidate: Candidate): ScoreResult {
  // SEMANTIC (55%) — raw cosine similarity from pgvector
  let semanticScore = Math.max(0, Math.min(1, candidate.similarity));

  // INDUSTRY ALIGNMENT (25%) — Industry-first hierarchy
  const comp = resolveIndustryCompatibility(
    {
      industry: source.industry,
      sector: source.sector,
      sectors: source.sector ? [source.sector] : [],
      serving_sectors: source.serving_sectors,
    },
    {
      industry: candidate.industry,
      sector: candidate.sectors?.[0] ?? null,
      sectors: candidate.sectors,
      serving_sectors: candidate.serving_sectors,
    }
  );
  const industryScore = comp.score;

  // INDUSTRY QUALITY GATE
  // Semantic similarity cannot compensate for a clear operating industry mismatch.
  // If the candidate merely serves the sector or is only a broad match, cap semantic influence.
  if (
    comp.level === 'SERVING_SECTOR_MATCH' ||
    comp.level === 'COARSE_SECTOR_MATCH' ||
    comp.level === 'GENERAL_FALLBACK' ||
    comp.level === 'INCOMPATIBLE'
  ) {
    semanticScore = Math.min(semanticScore, 0.75);
  }

  // FINANCIAL (10%) — compare deal size when present, otherwise revenue.
  const sMin = parseNum(source.deal_size_min ?? (source.deal_size_min_cr ? String(source.deal_size_min_cr) : null)) ??
    parseNum(source.revenue_min ?? (source.revenue_min_cr ? String(source.revenue_min_cr) : null)) ?? 0;
  const sMax = parseNum(source.deal_size_max ?? (source.deal_size_max_cr ? String(source.deal_size_max_cr) : null)) ??
    parseNum(source.revenue_max ?? (source.revenue_max_cr ? String(source.revenue_max_cr) : null)) ?? sMin;
  const cMin = candidate.deal_size_min_cr ?? candidate.revenue_min_cr ?? 0;
  const cMax = candidate.deal_size_max_cr ?? candidate.revenue_max_cr ?? cMin;

  let financialScore = 0.5; // neutral when data unavailable
  if (sMax > 0 && cMax > 0) {
    const overlapMin = Math.max(sMin, cMin);
    const overlapMax = Math.min(sMax, cMax);
    const overlap = Math.max(0, overlapMax - overlapMin);
    const union = Math.max(sMax, cMax) - Math.min(sMin, cMin);
    
    // Check if one is a point value that falls completely inside the other's range
    const isSPointInsideC = sMin === sMax && sMin >= cMin && sMin <= cMax;
    const isCPointInsideS = cMin === cMax && cMin >= sMin && cMin <= sMax;
    
    if ((union === 0 && sMax === cMax && sMax > 0) || isSPointInsideC || isCPointInsideS) {
      // Perfect fit
      financialScore = 1.0;
    } else {
      financialScore = union > 0 ? overlap / union : 0.1;
    }
  }

  // GEOGRAPHY (5%) — geo string matching
  const srcGeo = (source.geography ?? source.geographies?.[0] ?? '').toLowerCase();
  const cndGeos = (candidate.geographies ?? []).map(g => g.toLowerCase());
  let geoScore = 0;
  if (srcGeo && cndGeos.length) {
    if (cndGeos.some(g => g === srcGeo || g.includes(srcGeo) || srcGeo.includes(g))) {
      geoScore = 1.0;
    } else if (cndGeos.some(g => sameState(srcGeo, g))) {
      geoScore = 0.5;
    }
  }

  // FRESHNESS (5%) — recency bonus
  let freshnessScore = 0.5;
  if (candidate.created_at) {
    const ageDays = (Date.now() - new Date(candidate.created_at).getTime()) / 86400000;
    if (ageDays <= 30) freshnessScore = 1.0;
    else if (ageDays <= 90) freshnessScore = 0.7;
    else freshnessScore = 0.3;
  }

  // COMPOSITE (55 / 25 / 10 / 5 / 5)
  let finalScore =
    semanticScore * W.SEMANTIC * 100 +
    industryScore * W.INDUSTRY * 100 +
    financialScore * W.FINANCIAL * 100 +
    geoScore * W.GEOGRAPHY * 100 +
    freshnessScore * W.FRESHNESS * 100;

  // ADJUSTMENTS & SAFEGUARDS
  if (comp.penalty > 0) finalScore -= (comp.penalty * 100 * 0.5);

  // Safeguard: location alone must not push unrelated / generic candidates into results.
  // Threshold realigned to M5_sectorMatrix's current score bands (EXACT 1.0 / COMPATIBLE 0.9 /
  // SERVING_SECTOR_MATCH 0.85 / NARROW 0.70 / COARSE_SECTOR_MATCH 0.60 / GENERAL_FALLBACK 0.30) —
  // 0.2 was stale against a prior 3-tier scale and no longer caught GENERAL_FALLBACK (0.30).
  if (comp.isGeneralFallback || industryScore <= 0.35) {
    if (geoScore === 1.0) finalScore += 2;
    if (semanticScore < 0.65) finalScore -= 10;
    finalScore -= 12;
  } else {
    if (geoScore === 1.0) finalScore += 8;
    else if (geoScore === 0.5) finalScore += 4;
  }

  if (candidate.quality_tier === 1) finalScore += 5;
  else if (candidate.quality_tier === 2) finalScore += 2;

  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

  // ARCHETYPE
  const archetype = comp.archetype || MATCH_ARCHETYPES.CROSS_SECTOR;

  // MATCH REASON — anonymous, shown on match card. Prefers the true industry label over the
  // coarse sector tag when one exists.
  const indLabel = candidate.industry || candidate.sectors?.[0] || 'target sector';
  const geoLabel = candidate.geographies?.[0] ?? 'matched region';
  const sizeLabel = formatSizeRange(cMin, cMax);
  const reasonParts = [
    `${indLabel} in ${geoLabel}${sizeLabel ? ` · ${sizeLabel}` : ''}.`,
    comp.reason.split('.')[0] + '.',
  ];
  // "Strong alignment" language is only honest when there is real industry evidence behind it —
  // gating it on industryScore prevents a merely-generic semantic/financial subscore from reading
  // as a confident recommendation. For general-fallback pairs, an explicit caveat replaces it.
  const hasRealIndustryEvidence = !comp.isGeneralFallback && industryScore > 0.35;
  if (hasRealIndustryEvidence && financialScore > 0.7) reasonParts.push('Strong financial alignment.');
  else if (hasRealIndustryEvidence && semanticScore > 0.7) reasonParts.push('Strong mandate alignment.');
  else if (comp.isGeneralFallback || industryScore <= 0.35) {
    reasonParts.push(`Broader ${normalizeSector(candidate.sectors?.[0] ?? 'sector').toLowerCase()}-level alignment only — no confirmed ${source.industry ? source.industry.toLowerCase() : 'specific industry'} evidence.`);
  }
  const matchReason = reasonParts.join(' ');

  return {
    finalScore,
    breakdown: { semanticScore, industryScore, financialScore, geoScore, freshnessScore },
    matchReason,
    archetype,
  };
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

export function parseNum(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

export function formatSizeRange(min: number, max: number): string | null {
  if (!min && !max) return null;
  if (min === max) return `₹${min} Cr`;
  if (!min) return `Up to ₹${max} Cr`;
  if (!max) return `₹${min}+ Cr`;
  return `₹${min}–${max} Cr`;
}

export function getScoreLabel(score: number): 'High' | 'Good' | 'Possible' {
  if (score >= 75) return 'High';
  if (score >= 55) return 'Good';
  return 'Possible';
}

export function sameState(geo1: string, geo2: string): boolean {
  const groups = [
    ['mumbai', 'pune', 'nashik', 'nagpur', 'maharashtra', 'mh'],
    ['ahmedabad', 'surat', 'gujarat', 'rajkot', 'vadodara', 'gj'],
    ['delhi', 'noida', 'gurgaon', 'faridabad', 'ncr', 'new delhi'],
    ['bangalore', 'bengaluru', 'mysore', 'karnataka'],
    ['hyderabad', 'telangana', 'andhra'],
    ['chennai', 'coimbatore', 'tamil nadu', 'tn'],
    ['kolkata', 'west bengal', 'wb'],
    ['lucknow', 'kanpur', 'uttar pradesh', 'up'],
  ];
  return groups.some(g => g.some(k => geo1.includes(k)) && g.some(k => geo2.includes(k)));
}

export function computeQualityScore(input: ProposalInput): number {
  let s = 0;
  if (input.intent) s += 2;
  if (input.sector || input.industry) s += 2;
  if (input.geography) s += 1;
  if (input.deal_size_min || input.deal_size_max || input.deal_size_min_cr || input.deal_size_max_cr) s += 1;
  if (input.revenue_min || input.revenue_max || input.revenue_min_cr || input.revenue_max_cr) s += 1;
  if (input.structure || input.deal_structure) s += 1;
  if (input.intent_focus) s += 1;
  if (Object.keys(input.industry_data ?? {}).length > 0) s += 1;
  return Math.min(s, 10);
}

export function computeQualityTier(input: ProposalInput): number {
  const s = computeQualityScore(input);
  if (s >= 8) return 1;
  if (s >= 5) return 2;
  if (s >= 2) return 3;
  return 4;
}

// ─────────────────────────────────────────────────────────────
// MANDATE SUMMARY GENERATOR
// Produces an 80–250 word anonymized executive summary from
// structured ProposalInput fields. Stored in proposals.metadata
// and surfaced in the Deal Log as the human-readable preview.
// ─────────────────────────────────────────────────────────────

export function buildMandateSummary(input: ProposalInput): string {
  const intentMap: Record<string, string> = {
    SELL_SIDE: 'sell-side divestment',
    BUY_SIDE: 'strategic acquisition',
    FUNDRAISING: 'growth capital fundraise',
    DEBT: 'debt financing',
    STRATEGIC_PARTNERSHIP: 'strategic partnership',
  };
  const intentLabel = intentMap[input.intent] ?? 'strategic transaction';
  const sectorRaw = input.industry ?? input.sector ?? 'business';
  const sector = sectorRaw.replace(/_/g, ' ');
  const subSector = input.sub_sector === 'shell_company' ? 'dormant/shell company' : (input.sub_sector?.replace(/_/g, ' ') ?? null);
  const geo = input.geography;

  const sentences: string[] = [];

  // — Opener
  const geoStr = geo ? `${geo}-based ` : '';
  const subStr = subSector && subSector !== sector ? ` (${subSector})` : '';
  sentences.push(
    `${cap(intentLabel)} opportunity in the ${geoStr}${sector}${subStr} sector.`
  );

  // — Deal parameters
  const paramParts: string[] = [];
  const sMin = parseNum(input.deal_size_min ?? (input.deal_size_min_cr ? String(input.deal_size_min_cr) : null));
  const sMax = parseNum(input.deal_size_max ?? (input.deal_size_max_cr ? String(input.deal_size_max_cr) : null));
  if (sMin !== null || sMax !== null) {
    paramParts.push(
      sMin !== null && sMax !== null && sMin !== sMax
        ? `deal size ₹${sMin}–${sMax} Cr`
        : `deal size ₹${sMax ?? sMin} Cr`
    );
  } else if (input.deal_size) {
    paramParts.push(`deal size of ${input.deal_size}`);
  }
  const rMin = parseNum(input.revenue_min ?? (input.revenue_min_cr ? String(input.revenue_min_cr) : null));
  const rMax = parseNum(input.revenue_max ?? (input.revenue_max_cr ? String(input.revenue_max_cr) : null));
  if (rMin !== null || rMax !== null) {
    paramParts.push(
      rMin !== null && rMax !== null && rMin !== rMax
        ? `annual revenue ₹${rMin}–${rMax} Cr`
        : `annual revenue ₹${rMax ?? rMin} Cr`
    );
  } else if (input.revenue) {
    paramParts.push(`revenue of ${input.revenue}`);
  }
  if (input.structure || input.deal_structure) paramParts.push(`${input.structure || input.deal_structure} transaction structure`);
  if (paramParts.length > 0) {
    sentences.push(`The mandate involves ${paramParts.join(', ')}.`);
  }

  // — Operational highlights from industry_data
  const id = input.industry_data ?? {};
  const strOf = (v: unknown): string | null =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

  const highlights: string[] = [];
  const capacity = strOf(id.capacity) ?? strOf(id.installed_capacity) ?? strOf(id.production_capacity);
  const employees = strOf(id.employees) ?? strOf(id.workforce) ?? strOf(id.headcount);
  const ebitda = strOf(id.ebitda) ?? strOf(id.profitability) ?? strOf(id.margins);
  const channel = strOf(id.distribution_channel) ?? strOf(id.channel) ?? strOf(id.sales_channel);
  const model = strOf(id.business_model) ?? strOf(id.model) ?? strOf(id.revenue_model);
  const clients = strOf(id.clients) ?? strOf(id.customer_count) ?? strOf(id.customers);
  const beds = strOf(id.beds) ?? strOf(id.bed_count);
  const hospitals = strOf(id.hospitals) ?? strOf(id.hospital_count);
  const sku = strOf(id.sku_count) ?? strOf(id.product_range) ?? strOf(id.product_count);
  const arr = strOf(id.arr) ?? strOf(id.arpu) ?? strOf(id.mrr);
  const growth = strOf(id.growth_rate) ?? strOf(id.yoy_growth) ?? strOf(id.growth);
  const patents = strOf(id.patents) ?? strOf(id.ip);

  if (capacity) highlights.push(`production capacity of ${capacity}`);
  if (employees) highlights.push(`workforce of ${employees}`);
  if (ebitda) highlights.push(`${ebitda} EBITDA / profitability profile`);
  if (channel) highlights.push(`${channel} distribution channel`);
  if (model) highlights.push(`${model} business model`);
  if (clients) highlights.push(`${clients} active clients or customers`);
  if (hospitals) highlights.push(`$${hospitals} hospital facilities`);
  if (beds) highlights.push(`${beds} operational beds`);
  if (sku) highlights.push(`${sku} SKU / product range`);
  if (arr) highlights.push(`ARR / revenue run-rate of ${arr}`);
  if (growth) highlights.push(`${growth} revenue growth trajectory`);
  if (patents) highlights.push(`${patents} patents or IP assets`);

  if (highlights.length > 0) {
    sentences.push(`Key operational attributes include ${highlights.slice(0, 4).join(', ')}.`);
  }

  // — Counterparty profile
  const counterpartyFallback: Record<string, string> = {
    SELL_SIDE: 'strategic operators and private investment groups seeking expansion within the sector',
    BUY_SIDE: 'business owners, promoters, and intermediaries representing viable sell-side opportunities',
    FUNDRAISING: 'institutional investors, family offices, and growth-stage equity funds',
    DEBT: 'NBFCs, private credit funds, and structured debt providers',
    STRATEGIC_PARTNERSHIP: 'aligned strategic counterparties seeking mutually beneficial business collaboration',
  };
  const counterpartyDesc = input.intent_focus
    ? input.intent_focus.charAt(0).toLowerCase() + input.intent_focus.slice(1)
    : counterpartyFallback[input.intent] ?? 'aligned strategic counterparties';
  const geoSuffix = geo ? ` operating in or around ${geo}` : ' across India';
  sentences.push(`Ideal counterparties include ${counterpartyDesc}${geoSuffix}.`);

  const summary = sentences.join(' ');
  console.log(`[M5] Mandate summary generated (${summary.split(' ').length} words): ${summary.slice(0, 80)}...`);
  return summary;
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─────────────────────────────────────────────────────────────
// MAIN EXECUTION ENGINE
// Called synchronously from route.ts after mandate insert.
// Runs with 12-second timeout — match cards appear in same API response.
// ─────────────────────────────────────────────────────────────

export async function executeMatchmaking(
  input: ProposalInput,
): Promise<MatchmakingResult | null> {

  console.log('[M5] ====== MATCHMAKING ENGINE STARTED ======');
  console.log(`[M5] intent: ${input.intent} | sector: ${input.sector} | industry: ${input.industry} | geo: ${input.geography}`);

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    console.error('[M5] Supabase client init failed');
    return null;
  }

  try {
    // ── Phase 1: Build canonical texts ───────────────────────
    const storageText = buildCanonicalText(input);
    const reversedIntent = REVERSE_INTENT[input.intent] ?? input.intent;
    const queryText = buildCanonicalText(input, reversedIntent);

    console.log('[M5] Storage text:', storageText.slice(0, 80) + '...');
    console.log('[M5] Query text (reversed):', queryText.slice(0, 80) + '...');

    // ── Phase 2/3: Generate embeddings ───────────────────────
    const [storageEmbedding, queryEmbeddingRaw] = await Promise.all([
      embed(storageText),
      storageText !== queryText ? embed(queryText) : Promise.resolve(null as number[] | null),
    ]);
    const searchEmbedding = queryEmbeddingRaw ?? storageEmbedding;
    console.log('[M5] Embeddings generated');

    // ── Phase 4: Insert proposal record ──────────────────────
    const rawTextIsSubstantive = input.raw_text && input.raw_text.trim().length > 50;
    const enrichedRawText = (input.document_text || (rawTextIsSubstantive ? input.raw_text : null) || storageText).slice(0, 50_000);

    const safeDocText = input.document_text || null;
    const safeDocUrl = input.document_url || null;

    const { data: proposal, error: propErr } = await supabase
      .from('proposals')
      .upsert([{
        ...(input.id ? { id: input.id } : {}),
        user_id: input.userId,
        raw_text: enrichedRawText || storageText.slice(0, 4000),
        normalised_text: storageText,
        document_text: safeDocText,
        document_url: safeDocUrl,
        intent: input.intent,
        industry: input.industry ?? null,
        sectors: input.sector ? [normalizeSector(input.sector)] : [],
        serving_sectors: input.serving_sectors ?? [],
        geographies: input.geography ? [input.geography] : (input.geographies ?? []),
        deal_structure: input.structure || input.deal_structure || null,
        deal_size_min_cr: parseNum(input.deal_size_min ?? input.deal_size_min_cr),
        deal_size_max_cr: parseNum(input.deal_size_max ?? input.deal_size_max_cr),
        revenue_min_cr: parseNum(input.revenue_min ?? input.revenue_min_cr),
        revenue_max_cr: parseNum(input.revenue_max ?? input.revenue_max_cr),
        special_conditions: input.special_conditions ?? [],
        currency: input.currency || null,
        urgency: input.urgency || null,
        buyer_type: input.buyer_type || null,
        advisor_name: input.advisor_name || null,
        contact_phone: input.contact_phone || null,
        inferred_urgency: input.inferred_urgency || null,
        inferred_buyer_type: input.inferred_buyer_type || null,
        intent_validated: input.intent_validated ?? false,
        summary_text: buildMandateSummary(input),
        metadata: {
          ...(input.industry_data ?? {}),
          ...(input.industry ? { industry: input.industry } : {}),
          ...(input.serving_sectors ? { serving_sectors: input.serving_sectors } : {}),
          ...(safeDocUrl ? { document_url: safeDocUrl } : {}),
          mandate_summary: buildMandateSummary(input),
        },
        quality_score: computeQualityScore(input),
        quality_tier: computeQualityTier(input),
        embedding_status: 'GENERATING',
        status: 'ACTIVE',
        source: input.source ?? 'WEB',
      }], { onConflict: 'id' })
      .select('id')
      .single();

    if (propErr || !proposal) {
      console.error('[M5] Proposal insert failed:', propErr);
      throw new Error(`Proposal insert failed: ${propErr?.message || 'Unknown error'}`);
    }
    console.log('[M5] Proposal created:', proposal.id);

    // ── Phase 5: Store embedding ──────────────────────────────
    const { error: embErr } = await supabase.rpc('update_proposal_embedding', {
      proposal_id: proposal.id,
      embedding_vector: storageEmbedding,
    });
    if (embErr) console.warn('[M5] Embedding RPC failed (non-blocking):', embErr.message);
    else console.log('[M5] Storage embedding stored');

    // Always-on watch registrar
    const registerWatch = async (matchCount: number, notified: boolean) => {
      const watch = buildSavedSearchRecord(
        {
          userId: input.userId,
          intent: input.intent,
          sector: input.sector,
          industry: input.industry ?? null,
          serving_sectors: input.serving_sectors ?? [],
          geography: input.geography,
          structure: input.structure || input.deal_structure || null,
          sub_sector: input.sub_sector || null,
          deal_size_min: input.deal_size_min ?? (input.deal_size_min_cr ? String(input.deal_size_min_cr) : null),
          deal_size_max: input.deal_size_max ?? (input.deal_size_max_cr ? String(input.deal_size_max_cr) : null),
          revenue_min: input.revenue_min ?? (input.revenue_min_cr ? String(input.revenue_min_cr) : null),
          revenue_max: input.revenue_max ?? (input.revenue_max_cr ? String(input.revenue_max_cr) : null),
          buyer_type: input.buyer_type ?? null,
          inferred_buyer_type: input.inferred_buyer_type ?? null,
          currency: input.currency ?? null,
          urgency: input.urgency ?? null,
          special_conditions: input.special_conditions ?? [],
        },
        proposal.id,
        searchEmbedding,
        matchCount,
        notified,
      );
      const { error: ssErr } = await supabase.from('saved_searches').upsert([watch], { onConflict: 'proposal_id' });
      if (ssErr) console.warn('[M5] saved_searches upsert failed (non-blocking):', ssErr.message);
      else console.log(`[M5] Always-on watch registered (matches=${matchCount})`);
    };

    // ── Phase 6: pgvector ANN search ─────────────────────────
    const targetIntents = COUNTERPARTY_INTENTS[input.intent] ?? [input.intent];
    console.log('[M5] Target counterparty intents:', targetIntents);
    const { data: rawCandidates, error: searchErr } = await supabase.rpc('match_proposals', {
      query_embedding: searchEmbedding,
      match_intents: targetIntents,
      exclude_user_id: input.userId,
      min_quality: 3,
      result_count: 30,
    });

    if (searchErr) {
      console.error('[M5] pgvector search failed:', searchErr);
      console.error('[DEALCOLLAB MATCH TRACE]', { proposalId: proposal.id, candidatesEvaluated: 0, matchesGenerated: 0, matchesPersisted: 0, status: 'MATCHMAKING_FAILED', reason: 'pgvector_search_failed' });
      await registerWatch(0, false);
      // Real failure — never claim success/zero here, so the caller can distinguish
      // "searched and found nothing" from "search itself broke".
      return { proposalId: proposal.id, matchCount: 0, topScore: 0, cards: [], summary: 'Searching for counterparties...', status: 'MATCHMAKING_FAILED', persistedCount: 0 };
    }

    const candidates = (rawCandidates ?? []) as Candidate[];
    console.log('[M5] Candidates from pgvector:', candidates.length);

    if (candidates.length === 0) {
      console.log('[DEALCOLLAB MATCH TRACE]', { proposalId: proposal.id, candidatesEvaluated: 0, matchesGenerated: 0, matchesPersisted: 0, status: 'MATCHMAKING_COMPLETED_WITH_ZERO_MATCHES' });
      await registerWatch(0, false);
      return { proposalId: proposal.id, matchCount: 0, topScore: 0, cards: [], summary: 'No immediate matches. Your mandate runs continuously for 90 days.', status: 'MATCHMAKING_COMPLETED_WITH_ZERO_MATCHES', persistedCount: 0 };
    }

    // ── Phase 7/8: Hard rejections + V2 scoring ──────────────
    const phoneCount: Record<string, number> = {};
    const scoredRows: Array<{
      proposal_id: string;
      matched_proposal_id: string;
      similarity_score: number;
      industry_score: number;
      financial_score: number;
      geography_boost: number;
      confidence_score: number;
      final_score: number;
      match_reason: string;
      match_archetype: string;
      status: string;
    }> = [];

    for (const cand of candidates) {
      const { rejected, reason } = applyHardRejections(input, cand);
      if (rejected) { console.log(`[M5] REJECT ${cand.id}: ${reason}`); continue; }

      // HR-6: Advisor flood cap
      if (cand.contact_phone) {
        phoneCount[cand.contact_phone] = (phoneCount[cand.contact_phone] ?? 0) + 1;
        if (phoneCount[cand.contact_phone] > 2) {
          console.log('[M5] HR-6: advisor flood cap hit');
          continue;
        }
      }

      const scored = calculateV2Score(input, cand);
      console.log(`[M5] SCORE ${cand.id.slice(-8)}: ${scored.finalScore} (${scored.archetype})`);

      if (scored.finalScore >= 60) {
        scoredRows.push({
          proposal_id: proposal.id,
          matched_proposal_id: cand.id,
          similarity_score: scored.breakdown.semanticScore,
          industry_score: scored.breakdown.industryScore,
          financial_score: scored.breakdown.financialScore,
          geography_boost: scored.breakdown.geoScore,
          confidence_score: scored.breakdown.freshnessScore,
          final_score: scored.finalScore,
          match_reason: scored.matchReason,
          match_archetype: scored.archetype,
          status: 'ACTIVE',
        });
      }
    }

    // Sort by score descending, keep top 10
    scoredRows.sort((a, b) => b.final_score - a.final_score);
    const topRows = scoredRows.slice(0, 10);

    // ── Phase 9: forward (NEW->OLD) + reciprocal (OLD->NEW) + blind notify OLD ──
    let notifiedCount = 0;
    // Never trust the upsert call blindly — verify what actually landed in the DB via
    // .select() on the same call, so a partial/failed write can never masquerade as success.
    let persistedRows: typeof topRows = [];
    if (topRows.length > 0) {
      const { data: fwdIns, error: fwdErr } = await supabase
        .from('proposal_matches')
        .upsert(topRows, { onConflict: 'proposal_id,matched_proposal_id' })
        .select('proposal_id, matched_proposal_id');

      if (fwdErr) {
        console.error('[M5] Forward match upsert error:', fwdErr);
        console.error('[DEALCOLLAB MATCH TRACE]', { proposalId: proposal.id, candidatesEvaluated: candidates.length, matchesGenerated: topRows.length, matchesPersisted: 0, status: 'MATCH_PERSIST_FAILED', reason: fwdErr.message });
      } else {
        const persistedKeys = new Set((fwdIns ?? []).map(r => `${r.proposal_id}|${r.matched_proposal_id}`));
        persistedRows = topRows.filter(r => persistedKeys.has(`${r.proposal_id}|${r.matched_proposal_id}`));
        console.log(`[M5] ${persistedRows.length}/${topRows.length} forward matches upserted and verified`);
        if (persistedRows.length !== topRows.length) {
          console.error('[M5] PARTIAL PERSIST — generated vs verified mismatch:', { generated: topRows.length, persisted: persistedRows.length });
        }
      }

      const revSector = input.industry ?? (input.sector ? normalizeSector(input.sector) : null);
      const reverseReason = `${revSector ?? 'counterparty'}${input.geography ? ` in ${input.geography}` : ''}. New counterparty mandate aligned with your active position.`;
      const reciprocalRows = topRows.map((r) => buildReciprocalRow(r as MatchRow, reverseReason));
      const { data: recipIns, error: recErr } = await supabase
        .from('proposal_matches')
        .upsert(reciprocalRows, { onConflict: 'proposal_id,matched_proposal_id' })
        .select('id, proposal_id, final_score');
      if (recErr) console.error('[M5] Reciprocal match upsert error:', recErr);
      else console.log(`[M5] ${reciprocalRows.length} reciprocal matches upserted`);

      const notifRows = (recipIns ?? [])
        .map((row: { id: string; proposal_id: string; final_score: number | string }) => {
          const cand = candidates.find((c) => c.id === row.proposal_id);
          if (!cand || !cand.user_id) return null;
          return buildBlindNotification({
            oldUserId: cand.user_id,
            subjectProposalId: row.proposal_id,
            subjectRef: `#${String(row.proposal_id).slice(-6).toUpperCase()}`,
            subjectIntent: cand.intent,
            subjectSector: cand.industry || cand.sectors?.[0] || null,
            subjectGeography: cand.geographies?.[0] ?? null,
            matchId: row.id,
            cpSectorLabel: input.industry || (input.sector ? normalizeSector(input.sector) : null),
            cpGeographyLabel: input.geography ?? null,
            finalScore: Number(row.final_score),
          });
        })
        .filter((n: NotificationRecord | null): n is NotificationRecord => n !== null);

      if (notifRows.length > 0) {
        const { data: insertedNotifications, error: notifErr } = await supabase
          .from('notifications')
          .upsert(notifRows, { onConflict: 'match_id', ignoreDuplicates: true })
          .select('id,user_id,type,message,is_read,created_at');
        if (notifErr) console.error('[M5] Notification insert error:', notifErr);
        else {
          const notifications = (insertedNotifications ?? []) as NotificationRow[];
          notifiedCount = notifications.length;
          await Promise.all(notifications.map((notification) => deliverNotificationEmail(supabase, notification)));
          console.log(`[M5] ${notifiedCount} blind notifications stored`);
        }
      }
    }

    // Always register watch — uses verified persisted count, not the in-memory generated count.
    await registerWatch(persistedRows.length, notifiedCount > 0);

    // ── Phase 10: Build match cards for frontend ──────────────
    // Built from persistedRows only — a card must never be shown to the user for a match
    // that didn't actually make it into proposal_matches (it would vanish on refresh).
    const cards: MatchCard[] = persistedRows.slice(0, 3).map(row => {
      const cand = candidates.find(c => c.id === row.matched_proposal_id)!;
      const cMin = cand.deal_size_min_cr ?? 0;
      const cMax = cand.deal_size_max_cr ?? 0;
      return {
        matchedProposalId: row.matched_proposal_id,
        sector: cand.industry || cand.sectors?.[0] || null,
        geography: cand.geographies?.[0] ?? null,
        sizeRange: formatSizeRange(cMin, cMax),
        finalScore: row.final_score,
        scoreLabel: getScoreLabel(row.final_score),
        matchReason: row.match_reason,
        archetype: row.match_archetype,
      };
    });

    const topScore = persistedRows[0]?.final_score ?? 0;
    const status: MatchmakingStatus = persistedRows.length > 0
      ? 'MATCHMAKING_COMPLETED_WITH_MATCHES'
      : (topRows.length > 0 ? 'MATCHMAKING_FAILED' : 'MATCHMAKING_COMPLETED_WITH_ZERO_MATCHES');
    console.log(`[M5] ====== COMPLETE: generated=${topRows.length} persisted=${persistedRows.length} top score ${topScore} status=${status} ======`);
    console.log('[DEALCOLLAB MATCH TRACE]', {
      proposalId: proposal.id,
      candidatesEvaluated: candidates.length,
      matchesGenerated: topRows.length,
      matchesPersisted: persistedRows.length,
      status,
    });

    return {
      proposalId: proposal.id,
      matchCount: persistedRows.length,
      topScore,
      cards,
      summary: persistedRows.length > 0
        ? `${persistedRows.length} aligned counterpart${persistedRows.length > 1 ? 'ies' : 'y'} identified.`
        : topRows.length > 0
          ? 'We generated matches but could not save them — please retry.'
          : 'No immediate matches. Your mandate runs continuously for 90 days.',
      status,
      persistedCount: persistedRows.length,
    };

  } catch (err) {
    console.error('[M5] CRITICAL FAILURE:', err);
    throw err;
  }
}
