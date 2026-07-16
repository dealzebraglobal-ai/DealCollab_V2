/**
 * DealCollab — Matchmaking Execution Engine
 * ==========================================
 * Place at: src/lib/matchmakingEngine.ts
 *
 * V2 Philosophy: "Semantic meaning is truth"
 *
 * Scoring weights:
 *   SEMANTIC   45% — cosine similarity (pgvector)
 *   INDUSTRY   35% — sector compatibility (DC-KB-003 via M5_sectorMatrix)
 *   FINANCIAL  10% — deal size Jaccard overlap
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
import { getSectorCompatibility, normalizeSector, MATCH_ARCHETYPES, detectFraudSignals } from './M5_sectorMatrix';
import { buildReciprocalRow, buildBlindNotification, buildSavedSearchRecord, type MatchRow, type NotificationRecord } from './M5_persistence';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface ProposalInput {
  mandateId: string;
  userId: string;
  intent: string;
  raw_text: string;
  sector: string | null;
  industry?: string | null;   // hybrid: TRUE free-text industry (primary signal for matching)
  sub_sector: string | null;
  geography: string | null;
  deal_size: string | null;
  revenue: string | null;
  structure: string | null;
  intent_focus: string | null;
  industry_data: Record<string, unknown>;
  special_conditions: string[];
  deal_size_min: string | null;
  deal_size_max: string | null;
  revenue_min: string | null;
  revenue_max: string | null;
  is_shell_query?: boolean;   // NM5: true = include shells, false = exclude
  document_url?: string | null;   // URL of uploaded PDF/doc (if any)
  document_text?: string | null;  // Extracted text from uploaded document
  id?: string;
  source?: string;   // proposals.source — defaults to 'WEB' when omitted (chat flow)
}

interface Candidate {
  id: string;
  user_id: string | null;
  intent: string;
  sectors: string[] | null;
  geographies: string[] | null;
  deal_size_min_cr: number | null;
  deal_size_max_cr: number | null;
  revenue_min_cr: number | null;
  revenue_max_cr: number | null;
  deal_structure: string | null;
  normalised_text: string;
  similarity: number;
  advisor_name: string | null;
  contact_phone: string | null;
  fraud_flags: string[] | null;
  quality_tier: number;
  is_shell: boolean;
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

export interface MatchmakingResult {
  proposalId: string;
  matchCount: number;
  topScore: number;
  cards: MatchCard[];
  summary: string;
}

// ─────────────────────────────────────────────────────────────
// INTENT REVERSAL
// ─────────────────────────────────────────────────────────────

// Single-target reverse used only for building the reversed query EMBEDDING TEXT
// (so a FUNDRAISING company's query text sounds like BUY_SIDE to attract investors)
const REVERSE_INTENT: Record<string, string> = {
  BUY_SIDE: 'SELL_SIDE',
  SELL_SIDE: 'BUY_SIDE',
  FUNDRAISING: 'BUY_SIDE',   // FIX: was 'INVESTMENT' — not a valid intent in this system
  DEBT: 'DEBT',
  STRATEGIC_PARTNERSHIP: 'STRATEGIC_PARTNERSHIP',
};

// Multi-target map: the actual counterparty intents the SQL should search for.
// Authoritative — mirrors scoringEngine.ts INTENT_FLIP exactly.
// Used for: (a) match_proposals RPC 'match_intents' param, (b) HR-1 check.
const COUNTERPARTY_INTENTS: Record<string, string[]> = {
  BUY_SIDE: ['SELL_SIDE', 'FUNDRAISING'],
  SELL_SIDE: ['BUY_SIDE'],
  FUNDRAISING: ['BUY_SIDE'],
  DEBT: ['DEBT'],
  STRATEGIC_PARTNERSHIP: ['STRATEGIC_PARTNERSHIP'],
};

// ─────────────────────────────────────────────────────────────
// V2 SCORING WEIGHTS
// ─────────────────────────────────────────────────────────────

// Hybrid rebalance: the TRUE industry is now embedded, so semantic similarity carries the
// real industry signal. Lean on it more and treat the coarse sector-compatibility as a lighter
// sanity signal. These are the single tuning point — adjust after live validation if needed.
// (Previously SEMANTIC 0.45 / INDUSTRY 0.35.)
const W = {
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

  if (input.sub_sector) parts.push(input.sub_sector);
  if (input.geography) parts.push(input.geography);
  if (input.structure) parts.push(input.structure);
  if (input.intent_focus) parts.push(input.intent_focus);

  /**
   * Financial signal formatting.
   *
   * Why this exists:
   * - If min and max are same, show a single value.
   * - If min and max are different, show a range.
   *
   * Examples:
   * - min=30, max=30   → "revenue 30 crore"
   * - min=30, max=50   → "revenue 30 to 50 crore"
   * - min=150, max=150 → "deal size 150 crore"
   * - min=150, max=200 → "deal size 150 to 200 crore"
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

  /**
   * Fallback for raw text values.
   *
   * Example:
   * input.revenue = "₹30 Cr"
   * → "revenue 30 crore"
   *
   * input.deal_size = "₹150-200 Cr"
   * → "deal size 150 to 200 crore"
   */
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
  const sMin = parseNum(input.deal_size_min);
  const sMax = parseNum(input.deal_size_max);
  const dealSizeSignal =
    formatCrSignal('deal size', sMin, sMax) ||
    formatRawFinancialSignal('deal size', input.deal_size);

  if (dealSizeSignal) {
    parts.push(dealSizeSignal);
  }

  const rMin = parseNum(input.revenue_min);
  const rMax = parseNum(input.revenue_max);
  const revenueSignal =
    formatCrSignal('revenue', rMin, rMax) ||
    formatRawFinancialSignal('revenue', input.revenue);

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

async function embed(text: string): Promise<number[]> {
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

function applyHardRejections(
  source: ProposalInput,
  candidate: Candidate,
): { rejected: boolean; reason?: string } {

  // HR-1: Intent polarity mismatch (multi-target aware)
  // Uses COUNTERPARTY_INTENTS array so BUY_SIDE accepts both SELL_SIDE and FUNDRAISING.
  const expectedIntents = COUNTERPARTY_INTENTS[source.intent] ?? [];
  if (expectedIntents.length > 0 && !expectedIntents.includes(candidate.intent)) {
    return { rejected: true, reason: `HR-1: ${candidate.intent} not in expected [${expectedIntents.join(', ')}]` };
  }

  // HR-2: 10× deal size ceiling
  const sMax = parseNum(source.deal_size_max) ?? 0;
  const cMax = candidate.deal_size_max_cr ?? 0;
  if (sMax > 0 && cMax > 0) {
    const ratio = Math.max(sMax, cMax) / Math.max(Math.min(sMax, cMax), 0.01);
    if (ratio > 10) {
      return { rejected: true, reason: `HR-2: Size ratio ${ratio.toFixed(0)}× exceeds 10× ceiling` };
    }
  }

  // HR-3: Full buyout vs minority fundraise
  if (source.structure && candidate.deal_structure) {
    const src = source.structure.toLowerCase();
    const cnd = candidate.deal_structure.toLowerCase();
    if ((src.includes('100%') || src.includes('full buyout')) &&
      (cnd.includes('minority') || cnd.includes('fundrais'))) {
      return { rejected: true, reason: 'HR-3: Full buyout incompatible with minority fundraise' };
    }
  }

  // HR-4: Sector hard incompatibility — compare the TRUE industry when present, so an
  // ENUM-FIRST: HR-4 compares the COARSE ENUM (source.sector), not the free-text industry.
  // Only explicit HARD_INCOMPATIBLE enum pairs hard-reject; unknown/GENERAL buckets never do.
  // Fall back to free-text industry only when no sector enum is present.
  const sourceIndustryHR = source.sector ?? source.industry;
  if (sourceIndustryHR && candidate.sectors?.[0]) {
    const comp = getSectorCompatibility(sourceIndustryHR, candidate.sectors[0]);
    if (comp.level === 'INCOMPATIBLE') {
      return { rejected: true, reason: `HR-4: ${comp.reason}` };
    }
  }

  // HR-6: Advisor flood cap — max 2 results per contact_phone
  // (tracked externally in phoneCount map in main engine)

  // HR-7: Shell company filtering (NM5)
  if (!source.is_shell_query && candidate.is_shell === true) {
    return { rejected: true, reason: 'HR-7: Shell proposal excluded from operational query' };
  }

  // HR-8: Fraud signal rejection
  const fraudInFlags = (candidate.fraud_flags ?? []);
  const fraudInText = detectFraudSignals(candidate.normalised_text ?? '');
  if (fraudInFlags.length > 0 || fraudInText.length > 0) {
    return { rejected: true, reason: 'HR-8: Fraud signals detected' };
  }

  return { rejected: false };
}

// ─────────────────────────────────────────────────────────────
// PHASE 8: V2 COMPOSITE SCORING
// ─────────────────────────────────────────────────────────────

interface ScoreResult {
  finalScore: number;
  breakdown: Record<string, number>;
  matchReason: string;
  archetype: string;
}

function calculateV2Score(source: ProposalInput, candidate: Candidate): ScoreResult {

  // SEMANTIC (45%) — raw cosine similarity from pgvector
  const semanticScore = Math.max(0, Math.min(1, candidate.similarity));

  // INDUSTRY ALIGNMENT — sector compatibility via DC-KB-003 on the COARSE ENUM (source.sector),
  // NOT the free-text industry. Free-text drives the embedding/semantic side only; feeding it here
  // made every out-of-enum industry (e.g. "packaged healthy snacks") default to NARROW, collapsing
  // the 25% industry signal for legitimate same-sector pairs. Fall back to industry only if no enum.
  const comp = getSectorCompatibility(
    (source.sector ?? source.industry) ?? '',
    candidate.sectors?.[0] ?? '',
  );
  let industryScore = 0;
  switch (comp.level) {
    case 'COMPATIBLE': industryScore = 1.0; break;
    case 'NARROW': industryScore = 0.45; break;
    default: industryScore = 0.1;
  }

  // FINANCIAL (10%) — deal size Jaccard overlap
  const sMin = parseNum(source.deal_size_min) ?? 0;
  const sMax = parseNum(source.deal_size_max) ?? sMin;
  const cMin = candidate.deal_size_min_cr ?? 0;
  const cMax = candidate.deal_size_max_cr ?? cMin;

  let financialScore = 0.5; // neutral when data unavailable
  if (sMax > 0 && cMax > 0) {
    const overlapMin = Math.max(sMin, cMin);
    const overlapMax = Math.min(sMax, cMax);
    const overlap = Math.max(0, overlapMax - overlapMin);
    const union = Math.max(sMax, cMax) - Math.min(sMin, cMin);
    financialScore = union > 0 ? overlap / union : 0.1;
  }

  // GEOGRAPHY (5%) — geo string matching
  const srcGeo = (source.geography ?? '').toLowerCase();
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

  // COMPOSITE
  let finalScore =
    semanticScore * W.SEMANTIC * 100 +
    industryScore * W.INDUSTRY * 100 +
    financialScore * W.FINANCIAL * 100 +
    geoScore * W.GEOGRAPHY * 100 +
    freshnessScore * W.FRESHNESS * 100;

  // ADJUSTMENTS
  if (comp.level === 'NARROW') finalScore -= 10;
  if (geoScore === 1.0) finalScore += 8;
  else if (geoScore === 0.5) finalScore += 4;
  if (candidate.quality_tier === 1) finalScore += 5;
  else if (candidate.quality_tier === 2) finalScore += 2;

  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

  // ARCHETYPE
  let archetype: string = MATCH_ARCHETYPES.CROSS_SECTOR;
  const srcNorm = normalizeSector((source.sector ?? source.industry) ?? '');
  const cndNorm = normalizeSector(candidate.sectors?.[0] ?? '');
  if (!(source.sector ?? source.industry) || srcNorm === cndNorm) {
    archetype = MATCH_ARCHETYPES.BOLT_ON;
  } else if (comp.reason.includes('licence') || comp.reason.includes('Licence')) {
    archetype = MATCH_ARCHETYPES.LICENSE;
  } else if (comp.reason.includes('Vertical') || comp.reason.includes('backward integration')) {
    archetype = MATCH_ARCHETYPES.VERTICAL;
  } else if (comp.reason.includes('software') || comp.reason.includes('Tech')) {
    archetype = MATCH_ARCHETYPES.TECH_ENABLER;
  }

  // MATCH REASON — anonymous, shown on match card
  const sectorLabel = candidate.sectors?.[0] ?? 'target sector';
  const geoLabel = candidate.geographies?.[0] ?? 'matched region';
  const sizeLabel = formatSizeRange(cMin, cMax);
  const reasonParts = [
    `${sectorLabel} in ${geoLabel}${sizeLabel ? ` · ${sizeLabel}` : ''}.`,
    comp.reason.split('.')[0] + '.',
  ];
  if (financialScore > 0.7) reasonParts.push('Strong financial alignment.');
  else if (semanticScore > 0.7) reasonParts.push('Strong mandate alignment.');
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

function parseNum(val: string | null | undefined): number | null {
  if (!val) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function formatSizeRange(min: number, max: number): string | null {
  if (!min && !max) return null;
  if (min === max) return `₹${min} Cr`;
  if (!min) return `Up to ₹${max} Cr`;
  if (!max) return `₹${min}+ Cr`;
  return `₹${min}–${max} Cr`;
}

function getScoreLabel(score: number): 'High' | 'Good' | 'Possible' {
  if (score >= 75) return 'High';
  if (score >= 55) return 'Good';
  return 'Possible';
}

function sameState(geo1: string, geo2: string): boolean {
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

function computeQualityScore(input: ProposalInput): number {
  let s = 0;
  if (input.intent) s += 2;
  if (input.sector) s += 2;
  if (input.geography) s += 1;
  if (input.deal_size_min || input.deal_size_max) s += 1;
  if (input.revenue_min || input.revenue_max) s += 1;
  if (input.structure) s += 1;
  if (input.intent_focus) s += 1;
  if (Object.keys(input.industry_data ?? {}).length > 0) s += 1;
  return Math.min(s, 10);
}

function computeQualityTier(input: ProposalInput): number {
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
  const sectorRaw = input.sector ?? 'business';
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
  const sMin = parseNum(input.deal_size_min);
  const sMax = parseNum(input.deal_size_max);
  if (sMin !== null || sMax !== null) {
    paramParts.push(
      sMin !== null && sMax !== null && sMin !== sMax
        ? `deal size ₹${sMin}–${sMax} Cr`
        : `deal size ₹${sMax ?? sMin} Cr`
    );
  } else if (input.deal_size) {
    paramParts.push(`deal size of ${input.deal_size}`);
  }
  const rMin = parseNum(input.revenue_min);
  const rMax = parseNum(input.revenue_max);
  if (rMin !== null || rMax !== null) {
    paramParts.push(
      rMin !== null && rMax !== null && rMin !== rMax
        ? `annual revenue ₹${rMin}–${rMax} Cr`
        : `annual revenue ₹${rMax ?? rMin} Cr`
    );
  } else if (input.revenue) {
    paramParts.push(`revenue of ${input.revenue}`);
  }
  if (input.structure) paramParts.push(`${input.structure} transaction structure`);
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
  if (hospitals) highlights.push(`${hospitals} hospital facilities`);
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

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─────────────────────────────────────────────────────────────
// ASYNC RE-MATCH: superseded by registerWatch() inside executeMatchmaking.
// The old saveForAsyncRematch was removed: it omitted the NOT-NULL query_object (so its insert
// always threw and was swallowed) and only fired on zero-match. registerWatch writes a proper
// ACTIVE watch row for EVERY proposal via buildSavedSearchRecord.
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// MAIN EXECUTION ENGINE
// Called synchronously from route.ts after mandate insert.
// Runs with 12-second timeout — match cards appear in same API response.
// ─────────────────────────────────────────────────────────────

export async function executeMatchmaking(
  input: ProposalInput,
): Promise<MatchmakingResult | null> {

  console.log('[M5] ====== MATCHMAKING ENGINE STARTED ======');
  console.log(`[M5] intent: ${input.intent} | sector: ${input.sector} | geo: ${input.geography}`);

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
    // raw_text: document text first (full PDF content for full-text search),
    // fall back to user message only when substantive (>50 chars — avoids storing "Go ahead!" etc.),
    // then canonical text if no document attached.
    const rawTextIsSubstantive = input.raw_text && input.raw_text.trim().length > 50;
    const enrichedRawText = (input.document_text || (rawTextIsSubstantive ? input.raw_text : null) || storageText).slice(0, 50_000);

    const safeDocText = input.document_text || null;
    const safeDocUrl = input.document_url || null;

    // upsert (not insert) so that passing an existing `input.id` updates that
    // proposal in place instead of erroring on the primary-key conflict —
    // needed for "search for matches" re-runs against an already-created
    // proposal (e.g. bulk-uploaded mandates). When id is omitted this behaves
    // identically to a plain insert (Postgres assigns the default uuid).
    const { data: proposal, error: propErr } = await supabase
      .from('proposals')
      .upsert([{
        id: input.id || undefined,
        user_id: input.userId,
        mandate_id: input.mandateId,
        raw_text: enrichedRawText || storageText.slice(0, 4000),
        normalised_text: storageText,
        document_text: safeDocText,
        document_url: safeDocUrl,
        intent: input.intent,
        sectors: input.sector ? [normalizeSector(input.sector)] : [],
        geographies: input.geography ? [input.geography] : [],
        deal_structure: input.structure,
        deal_size_min_cr: parseNum(input.deal_size_min),
        deal_size_max_cr: parseNum(input.deal_size_max),
        revenue_min_cr: parseNum(input.revenue_min),
        revenue_max_cr: parseNum(input.revenue_max),
        special_conditions: input.special_conditions ?? [],
        metadata: {
          ...(input.industry_data ?? {}),
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
      return null;
    }
    console.log('[M5] Proposal created:', proposal.id);
    console.log('[M5] Document text length:', safeDocText?.length ?? 0);
    console.log('[M5] Document URL:', safeDocUrl);

    // ── Phase 5: Store embedding ──────────────────────────────
    const { error: embErr } = await supabase.rpc('update_proposal_embedding', {
      proposal_id: proposal.id,
      embedding_vector: storageEmbedding,
    });
    if (embErr) console.warn('[M5] Embedding RPC failed (non-blocking):', embErr.message);
    else console.log('[M5] Storage embedding stored');

    // Always-on watch registrar (idempotent on proposal_id). Defined once, called on EVERY exit
    // path so a watch row exists for every proposal — not only zero-match ones (old behaviour).
    // Writes query_object (the NOT-NULL the old saveForAsyncRematch omitted) + the reversed-intent
    // search embedding + status ACTIVE.
    const registerWatch = async (matchCount: number, notified: boolean) => {
      const watch = buildSavedSearchRecord(
        {
          userId: input.userId, intent: input.intent, sector: input.sector, industry: input.industry ?? null,
          geography: input.geography, structure: input.structure, sub_sector: input.sub_sector,
          deal_size_min: input.deal_size_min, deal_size_max: input.deal_size_max,
          revenue_min: input.revenue_min, revenue_max: input.revenue_max, special_conditions: input.special_conditions
        },
        proposal.id, searchEmbedding, matchCount, notified,
      );
      const { error: ssErr } = await supabase.from('saved_searches').upsert([watch], { onConflict: 'proposal_id' });
      if (ssErr) console.warn('[M5] saved_searches upsert failed (non-blocking):', ssErr.message);
      else console.log(`[M5] Always-on watch registered (matches=${matchCount})`);
    };

    // ── Phase 6: pgvector ANN search ─────────────────────────
    // FIX: parameter names updated to match current SQL function signature
    // (match_proposals was changed in 20260515 + 20260521 migrations):
    //   query_intent  → match_intents (TEXT[], pre-flipped counterparty intents)
    //   query_user_id → exclude_user_id
    //   match_limit   → result_count
    //   exclude_shells removed (not in SQL; shell filtering is HR-7 in TypeScript)
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
      await registerWatch(0, false);
      return { proposalId: proposal.id, matchCount: 0, topScore: 0, cards: [], summary: 'Searching for counterparties...' };
    }

    const candidates = (rawCandidates ?? []) as Candidate[];
    console.log('[M5] Candidates from pgvector:', candidates.length);

    if (candidates.length === 0) {
      await registerWatch(0, false);
      return { proposalId: proposal.id, matchCount: 0, topScore: 0, cards: [], summary: 'No immediate matches. Your mandate runs continuously for 90 days.' };
    }

    // ── Phase 7/8: Hard rejections + V2 scoring ──────────────
    const phoneCount: Record<string, number> = {};
    const scoredRows: Array<{
      proposal_id: string;
      matched_proposal_id: string;
      similarity_score: number;   // FIX: was semantic_score (renamed in 20260515 migration)
      industry_score: number;
      financial_score: number;
      geography_boost: number;    // FIX: was geography_score (renamed in 20260515 migration)
      confidence_score: number;   // FIX: was freshness_score (renamed in 20260515 migration)
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
          similarity_score: scored.breakdown.semanticScore,   // FIX: post-rename column
          industry_score: scored.breakdown.industryScore,
          financial_score: scored.breakdown.financialScore,
          geography_boost: scored.breakdown.geoScore,          // FIX: post-rename column
          confidence_score: scored.breakdown.freshnessScore,   // FIX: post-rename column
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
    if (topRows.length > 0) {
      // 9a. Forward upsert (idempotent on the pair; needs uq_proposal_matches_pair index).
      const { error: fwdErr } = await supabase
        .from('proposal_matches')
        .upsert(topRows, { onConflict: 'proposal_id,matched_proposal_id' });
      if (fwdErr) console.error('[M5] Forward match upsert error:', fwdErr);
      else console.log(`[M5] ${topRows.length} forward matches upserted`);

      // 9b. Reciprocal upsert — old user benefits from new deal flow. Reason is written from the
      // SOURCE mandate's descriptor so the old user reads about the NEW proposal, not their own.
      const revSector = input.sector ? normalizeSector(input.sector) : null;
      const reverseReason = `${revSector ?? 'counterparty'}${input.geography ? ` in ${input.geography}` : ''}. New counterparty mandate aligned with your active position.`;
      const reciprocalRows = topRows.map((r) => buildReciprocalRow(r as MatchRow, reverseReason));
      const { data: recipIns, error: recErr } = await supabase
        .from('proposal_matches')
        .upsert(reciprocalRows, { onConflict: 'proposal_id,matched_proposal_id' })
        .select('id, proposal_id, final_score');
      if (recErr) console.error('[M5] Reciprocal match upsert error:', recErr);
      else console.log(`[M5] ${reciprocalRows.length} reciprocal matches upserted`);

      // 9c. Blind notifications to OLD users (reciprocal direction: proposal_id = OLD, matched = NEW).
      const notifRows = (recipIns ?? [])
        .map((row: { id: string; proposal_id: string; final_score: number | string }) => {
          const cand = candidates.find((c) => c.id === row.proposal_id); // OLD proposal (recipient)
          if (!cand || !cand.user_id) return null;                       // can't notify an anonymous owner
          return buildBlindNotification({
            oldUserId: cand.user_id,
            subjectProposalId: row.proposal_id,
            subjectRef: `#${String(row.proposal_id).slice(-6).toUpperCase()}`,
            subjectIntent: cand.intent,                                   // recipient's OWN proposal (safe to name)
            subjectSector: cand.sectors?.[0] ?? null,
            subjectGeography: cand.geographies?.[0] ?? null,
            matchId: row.id,
            cpSectorLabel: input.sector ? normalizeSector(input.sector) : null,  // the NEW counterparty (input)
            cpGeographyLabel: input.geography ?? null,
            finalScore: Number(row.final_score),
          });
        })
        .filter((n: NotificationRecord | null): n is NotificationRecord => n !== null);
      if (notifRows.length > 0) {
        const { error: notifErr } = await supabase
          .from('notifications')
          .upsert(notifRows, { onConflict: 'match_id', ignoreDuplicates: true });
        if (notifErr) console.error('[M5] Notification insert error:', notifErr);
        else { notifiedCount = notifRows.length; console.log(`[M5] ${notifiedCount} blind notifications stored`); }
      }
    }

    // 9d. ALWAYS register the always-on watch (every active proposal, match or no match).
    await registerWatch(topRows.length, notifiedCount > 0);

    // ── Phase 10: Build match cards for frontend ──────────────
    const cards: MatchCard[] = topRows.slice(0, 3).map(row => {
      const cand = candidates.find(c => c.id === row.matched_proposal_id)!;
      const cMin = cand.deal_size_min_cr ?? 0;
      const cMax = cand.deal_size_max_cr ?? 0;
      return {
        matchedProposalId: row.matched_proposal_id,
        sector: cand.sectors?.[0] ?? null,
        geography: cand.geographies?.[0] ?? null,
        sizeRange: formatSizeRange(cMin, cMax),
        finalScore: row.final_score,
        scoreLabel: getScoreLabel(row.final_score),
        matchReason: row.match_reason,
        archetype: row.match_archetype,
      };
    });

    const topScore = topRows[0]?.final_score ?? 0;
    console.log(`[M5] ====== COMPLETE: ${topRows.length} matches, top score ${topScore} ======`);

    return {
      proposalId: proposal.id,
      matchCount: topRows.length,
      topScore,
      cards,
      summary: topRows.length > 0
        ? `${topRows.length} aligned counterpart${topRows.length > 1 ? 'ies' : 'y'} identified.`
        : 'No immediate matches. Your mandate runs continuously for 90 days.',
    };

  } catch (err) {
    console.error('[M5] CRITICAL FAILURE:', err);
    return null;
  }
}