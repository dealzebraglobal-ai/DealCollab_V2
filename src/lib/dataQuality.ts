/**
 * DealCollab — Data Quality Utilities
 * =====================================
 * Canonical number parsing and quality scoring.
 * Used by: detectors.ts (normalizeSize), route.ts, matchmakingEngine.ts
 *
 * Exported:
 *   ✔ normalizeSize()        — parses deal size / revenue strings → Cr amounts
 *   ✔ normalizeIntent()      — canonicalizes raw intent strings → DealIntent
 *   ✔ computeQualityScore()  — 0–10 quality score for a RouterState
 *   ✔ qualityTierFromScore() — score → Tier 1–4 label
 */

import type { RouterState, DealIntent } from './types';
import { computeQualityGate } from './qualityGate';

// ─────────────────────────────────────────────────────────────
// ENCODING REPAIR
// Fixes mojibake (â€", â‚¹, Â ) from CSV-seeded proposals.
// ─────────────────────────────────────────────────────────────

const MOJIBAKE_MAP: Array<[string, string]> = [
  ['â€"', '—'],
  ['â€"', '–'],
  ['â€˜', '‘'],
  ['â€™', '’'],
  ['â€œ', '“'],
  ['â€', '”'],
  ['â‚¹', '₹'],
  ['Â ', ' '],
  [' ', ' '],
  ['﻿', ''],
];

export function fixEncoding(text: string): string {
  if (!text) return '';
  let out = text;
  for (const [bad, good] of MOJIBAKE_MAP) out = out.split(bad).join(good);
  return out.trim();
}

// ─────────────────────────────────────────────────────────────
// SHELL COMPANY / HARD EXCLUSION / SECTOR LEGITIMACY
// Used by scoringEngine.ts hard rules (HR-6..HR-10).
// ─────────────────────────────────────────────────────────────

export type QualityTier = 1 | 2 | 3 | 4;

const SHELL_SIGNALS: RegExp[] = [
  /turnover[:\s]*zero/i,
  /annual turnover[:\s]*nil/i,
  /turnover[:\s]*nil/i,
  /zero turnover/i,
  /no turnover/i,
  /no business activity/i,
  /non[- ]operative/i,
  /dormant company/i,
  /psc[:\s]*(?:₹?\s*)?[1-9]\s*lakh/i,
  /paid[- ]up capital[:\s]*(?:₹?\s*)?[1-9]\s*lakh/i,
  /inc[- ]20a/i,
  /shell company/i,
  /kindly\s+dm\s+me?\b/i,
  /anyone\s+interested\s*,?\s*dm/i,
  /available\s+for\s+sale\.?\s*(please\s+dm|anyone\s+interested|dm)/i,
  /company\s+available\s+for\s+sale/i,
  /company\s+for\s+sell?[:\-|]?/i,
  /price\s*[:\-]?\s*(?:very\s*)*cheap/i,
  /nature of business\s+trading/i,
  /trading\s+[na&]\s+distribution/i,
  /trading\s+and\s+distribution/i,
];

const SECTOR_CONTRADICTIONS: Record<string, RegExp[]> = {
  saas: [
    /nature of business\s+trading/i,
    /trading\s+[na&]\s+distribution/i,
    /trading\s+and\s+distribution/i,
    /\bimport\s+export\b/i,
    /\bwholesale\s+trade\b/i,
    /\bmanufacturing\s+unit\b/i,
    /\bfmcg\b/i,
    /\btextiles?\b/i,
    /\breal\s*estate\b/i,
    /\bpharma(?:ceutical)?\b/i,
    /\bhotel\b|\bhospitality\b/i,
    /\bconstruction\s+company\b/i,
  ],
  finserv: [
    /nature of business\s+trading/i,
    /\bmanufacturing\s+unit\b/i,
    /\bfmcg\b/i,
    /\btextiles?\b/i,
    /\breal\s*estate\b/i,
    /\bpharma(?:ceutical)?\b/i,
    /\bhotel\b|\bhospitality\b/i,
    /\bconstruction\s+company\b/i,
    /\bimport\s+export\b/i,
    /\bwholesale\s+trade\b/i,
    /\bagriculture\b|\bfarming\b/i,
  ],
  manufacturing: [
    /\bsaas\s+platform\b/i,
    /\bsoftware\s+company\b/i,
  ],
};

export const DIGITAL_MARKETING_SIGNALS: RegExp[] = [
  /\bdigital\s+marketing\b/i,
  /\bseo\b/i,
  /\bperformance\s+marketing\b/i,
  /\bpaid\s+(?:ads?|advertising|media)\b/i,
  /\bsocial\s+media\s+marketing\b/i,
  /\bcustomer\s+acquisition\b/i,
  /\bcrm\s+automation\b/i,
  /\bad[- ]?tech\b/i,
  /\bmarketing\s+automation\b/i,
  /\bcampaign\s+management\b/i,
  /\bmartech\b/i,
  /\bgoogle\s+ads\b/i,
  /\bfacebook\s+ads\b/i,
  /\bprogrammatic\s+advertising\b/i,
  /\blead\s+generation\b/i,
  /\bppc\b/i,
  /\bsem\b/i,
  /\binfluencer\s+marketing\b/i,
  /\bemail\s+marketing\b/i,
  /\bmarketing\s+agency\b/i,
];

export function isDigitalMarketing(rawText: string): boolean {
  if (!rawText) return false;
  return DIGITAL_MARKETING_SIGNALS.filter(re => re.test(rawText)).length >= 2;
}

/** 0–100 shell company risk score. ≥40 = moderate risk, ≥70 = high risk. */
export function shellCompanyScore(rawText: string): number {
  if (!rawText) return 0;
  const hardHits = SHELL_SIGNALS.filter(re => re.test(rawText)).length;
  const lower = rawText.toLowerCase();
  const softSignals = [
    'roc ', ' roc\n', '| roc', 'roc based', 'roc compliant', 'roc fully compliant',
    'authorised capital', 'authorized capital', 'paid up capital', 'paid-up capital',
    'gst surrendered', 'gst cancelled', 'gst inactive',
    'c/f loss', 'c/f capital loss', 'c/f business loss',
    'carried forward loss', 'carry forward loss', 'unabsorbed loss',
    'zero litigation', 'no litigation', 'nil litigation',
    'it compliant', 'objects -', 'objects:', '| objects',
    'no operations', 'dormant', 'non-operational',
  ];
  const softHits = softSignals.filter(s => lower.includes(s)).length;
  return Math.min(100, (hardHits * 30) + (softHits * 10));
}

/** True if raw_text strongly indicates a shell/dormant company. */
export function isShellCompany(rawText: string): boolean {
  if (!rawText) return false;

  const shellHits = SHELL_SIGNALS.filter(re => re.test(rawText)).length;
  if (shellHits >= 1) return true;

  const lower = rawText.toLowerCase();
  const multiSignals = [
    'shell company', 'dormant company', 'blank company',
    'roc ', ' roc\n', '| roc', 'roc based', 'roc compliant', 'roc fully compliant',
    'authorised capital', 'authorized capital', 'paid up capital', 'paid-up capital',
    'gst surrendered', 'gst cancelled', 'gst inactive',
    'c/f loss', 'c/f capital loss', 'c/f business loss',
    'carried forward loss', 'carry forward loss', 'unabsorbed loss',
    'zero litigation', 'no litigation', 'nil litigation',
    'it compliant', 'objects -', 'objects:', '| objects',
    'no operations', 'dormant', 'non-operational',
  ];
  const score = multiSignals.filter(s => lower.includes(s)).length;
  return score >= 2;
}

export const HARD_EXCLUSION_SIGNALS: RegExp[] = [
  /\bgst\s+(?:number|no\.?|registration)?\s*(?:for\s+)?(?:sale|available|transfer)\b/i,
  /\btrademark\s+(?:for\s+)?(?:sale|transfer|available)\b/i,
  /\biso\s+(?:certificate|certified)?\s*(?:for\s+)?(?:sale|transfer|available)\b/i,
  /\bfssai\s+(?:for\s+)?(?:sale|transfer|available)\b/i,
  /\bdrug\s+license\s+(?:for\s+)?(?:sale|transfer|available)\b/i,
  /\bdormant\s+(?:company|entity|firm)\b/i,
  /\binactive\s+(?:company|entity|business|firm)\b/i,
  /\bno\s+(?:business\s+)?operations?\b/i,
  /\bnon[- ]operative\b/i,
  /\bnon[- ]operational\b/i,
  /\bblank\s+(?:company|entity)\b/i,
  /\bpaper\s+company\b/i,
  /\bspv\b/i,
  /\bshelf\s+company\b/i,
  /\bholding\s+(?:structure\s+)?only\b/i,
  /\bcompliance[- ]only\b/i,
  /anyone\s+interested\s*[,]?\s*(?:dm|contact|whatsapp)/i,
  /\bkindly\s+(?:dm|whatsapp|message)\s+me\b/i,
  /\bprice\s*[:\-]?\s*(?:very\s*)?cheap\b/i,
  /company\s+for\s+sell?[:\s|\-]/i,
  /available\s+for\s+(?:sale|acquisition)[.\s]*(?:please\s+)?(?:dm|contact|whatsapp)/i,
  /\binc[- ]20a\b/i,
  /\brequired?\s+\d+\s*(?:yr|year|month)s?\s+old\s+company\b/i,
  /\bnon[- ]?gst\s+company\s+(?:available|for\s+sale)\b/i,
  /\bwithout\s+gst\s*[,.]?\s*capital\s*[=:]/i,
  /\bcompany\s+available\s+for\s+sale\b/i,
  /\bcompany\s+for\s+sale\b/i,
  /\bpvt\.?\s*ltd\.?\s+(?:company\s+)?(?:for\s+)?(?:sale|available)\b/i,
  /\bnbfc\s+(?:for\s+)?(?:sale|available|transfer)\b/i,
  /\b(?:bse|nse)[- ]listed\s+company\s+(?:for\s+)?(?:sale|available|transfer)\b/i,
  /\bunlisted\s+(?:company|nbfc)\s+(?:for\s+)?(?:sale|available)\b/i,
  /\bnof\s*[=:]\s*[\d.]+\s*(?:cr|crore)\b/i,
];

/** True if a proposal should be hard-excluded from all match results. */
export function isHardExcluded(rawText: string, exempt = false): boolean {
  if (!rawText || exempt) return false;
  return HARD_EXCLUSION_SIGNALS.some(re => re.test(rawText));
}

const DIGITAL_MARKETING_OPERATIONAL: RegExp[] = [
  /\bdigital\s+marketing\b/i,
  /\bperformance\s+marketing\b/i,
  /\bseo\b/i,
  /\bsem\b/i,
  /\bpaid\s+(?:ads?|advertising|media)\b/i,
  /\bsocial\s+media\s+(?:marketing|management|agency)\b/i,
  /\bcustomer\s+acquisition\b/i,
  /\bcrm\s+(?:system|platform|automation|software)\b/i,
  /\bmarketing\s+automation\b/i,
  /\bcampaign\s+management\b/i,
  /\bmartech\b/i,
  /\bad[- ]?tech\b/i,
  /\bgoogle\s+ads\b/i,
  /\bfacebook\s+ads\b/i,
  /\bmeta\s+ads\b/i,
  /\bprogrammatic\s+advertising\b/i,
  /\blead\s+generation\b/i,
  /\binfluencer\s+marketing\b/i,
  /\bemail\s+marketing\b/i,
  /\bmarketing\s+agency\b/i,
  /\bmedia\s+buying\b/i,
  /\bppc\b/i,
  /\bcontent\s+marketing\b/i,
  /\bmarketing\s+(?:platform|saas|tool)\b/i,
];

/** 0–1 relevance score for digital marketing operational content. */
export function digitalMarketingRelevanceScore(rawText: string): number {
  if (!rawText) return 0;
  const hits = DIGITAL_MARKETING_OPERATIONAL.filter(re => re.test(rawText)).length;
  return Math.min(1.0, hits / 3);
}

const BOILERPLATE_SIGNALS: RegExp[] = [
  /\bobjects?\s*[:\-|]/i,
  /\bauthoised\s+(?:share\s+)?capital\b/i,
  /\bauthorised\s+(?:share\s+)?capital\b/i,
  /\bpaid[- ]up\s+(?:share\s+)?capital\b/i,
  /\bcin\s+[lu][0-9]/i,
  /\bdin\s+[0-9]{8}/i,
  /\broc\s+(?:compliant|registered|filing)/i,
  /\bregistered\s+under\s+(?:the\s+)?companies\s+act/i,
  /\bgst\s+(?:registered|active|compliant)\b/i,
  /\bit\s+(?:returns?\s+)?(?:filed|compliant)\b/i,
  /\bnature\s+of\s+business\s*[:\-]?\s*(?:it|software|digital|technology)\b/i,
  /\bdate\s+of\s+(?:incorporation|registration)\b/i,
  /year\s+of\s+(?:incorporation|establishment)\s*[:\-]?\s*\d{4}/i,
];

/** 0–1 score of how operationally rich the content is (1 = detailed, 0 = boilerplate). */
export function operationalRichnessScore(rawText: string): number {
  if (!rawText) return 0;
  const text = rawText.trim();
  if (text.length < 40) return 0;

  const boilerplateHits = BOILERPLATE_SIGNALS.filter(re => re.test(text)).length;
  const lengthScore = Math.min(1.0, text.length / 600);
  const boilerplatePenalty = Math.min(0.8, boilerplateHits * 0.15);

  return Math.max(0, lengthScore - boilerplatePenalty);
}

/** False if a proposal's claimed sector is contradicted by its actual text. */
export function isSectorLegitimate(claimedSector: string | null, rawText: string | null): boolean {
  if (!claimedSector || !rawText) return true;
  const contradictions = SECTOR_CONTRADICTIONS[claimedSector.toLowerCase()];
  if (!contradictions) return true;
  return !contradictions.some(re => re.test(rawText));
}

// ─────────────────────────────────────────────────────────────
// NORMALIZE SIZE
// Parses deal size / revenue / ticket size strings into
// structured min_cr / max_cr values.
//
// Handles:
//   "₹50 Cr"          → { min_cr: 50,   max_cr: 50   }
//   "50-100 Cr"        → { min_cr: 50,   max_cr: 100  }
//   "50 to 200 crore"  → { min_cr: 50,   max_cr: 200  }
//   "~50 Cr"           → { min_cr: 50,   max_cr: 50   }
//   "500 lakh"         → { min_cr: 5,    max_cr: 5    }
//   "50 lakh-1 Cr"     → { min_cr: 0.5,  max_cr: 1    }
//   "USD 50M"          → { min_cr: 415,  max_cr: 415  } (≈ 1 USD = 83 INR)
//   "INR 100M"         → { min_cr: 10,   max_cr: 10   } (10M INR = 1 Cr)
//   "1.5 billion"      → { min_cr: 1500, max_cr: 1500 } (INR context)
//   "20 MW"            → null (non-financial — MW is not Cr)
// ─────────────────────────────────────────────────────────────

export interface NormalizedSize {
  min_cr: number | null;
  max_cr: number | null;
}

export function normalizeSize(text: string): NormalizedSize | null {
  if (!text || typeof text !== 'string') return null;

  const clean = text.replace(/[₹,]/g, '').toLowerCase().trim();

  // Detect unit from context BEFORE extracting numbers
  const unit = detectUnit(clean);
  if (unit === null) return null; // Non-financial unit (MW, acres, etc.)

  // Range pattern: "50-100", "50 to 100", "50–100", "50 lakh - 1 cr"
  const rangeMatch = clean.match(
    /~?(\d+(?:\.\d+)?)\s*(?:cr(?:ore)?s?|l(?:akh)?s?|m(?:illion)?|b(?:illion)?)?\s*(?:to|-|–)\s*~?(\d+(?:\.\d+)?)/i,
  );
  if (rangeMatch) {
    const lo = parseFloat(rangeMatch[1]);
    const hi = parseFloat(rangeMatch[2]);
    if (isNaN(lo) || isNaN(hi)) return null;

    // Phase 2.2: each side of a range can carry its OWN unit ("50 lakh - 1 cr").
    // Detect the explicit unit on each side; a side with no unit inherits the
    // other side's unit (so "50-100 Cr" still treats both as Cr). Then sort, so
    // min_cr ≤ max_cr no matter how the units shake out.
    const sides = clean.split(/\s*(?:to|–|-)\s*/);
    const loOwn = explicitUnitOf(sides[0] ?? '');
    const hiOwn = explicitUnitOf(sides[sides.length - 1] ?? '');
    const loUnit = loOwn ?? hiOwn ?? unit;
    const hiUnit = hiOwn ?? loOwn ?? unit;

    const a = toCr(lo, loUnit);
    const b = toCr(hi, hiUnit);
    return { min_cr: Math.min(a, b), max_cr: Math.max(a, b) };
  }

  // Single value: "50 Cr", "~50cr", "1.5 crore"
  const singleMatch = clean.match(/~?(\d+(?:\.\d+)?)/);
  if (singleMatch) {
    const val = parseFloat(singleMatch[1]);
    if (isNaN(val)) return null;
    const cr = toCr(val, unit);
    return { min_cr: cr, max_cr: cr };
  }

  return null;
}

type SizeUnit = 'cr' | 'lakh' | 'million_inr' | 'million_usd' | 'billion_inr';

// Returns null for non-financial units (MW, acres, sq ft, etc.)
function detectUnit(text: string): SizeUnit | null {
  // Exclude non-financial size units
  if (/\bmw\b|\bmwp\b|\bmwdc\b|\bacres?\b|\bsq\.?\s?ft\b|\bhectare/.test(text)) return null;

  // Order matters — check most specific first
  if (/\bbillion\b/.test(text)) return 'billion_inr';
  if (/(usd|us\$|\$|dollar)/.test(text) && /m(illion)?/.test(text)) return 'million_usd';
  if (/inr/.test(text) && /m(illion)?/.test(text)) return 'million_inr';
  if (/cr(ore)?s?/.test(text)) return 'cr';
  if (/l(akh)?s?/.test(text)) return 'lakh';
  if (/m(illion)?/.test(text)) return 'million_inr'; // bare "million" = INR million in India context

  // Default: assume Crore (most common unit in Indian M&A deal sizes)
  return 'cr';
}

// Phase 2.2: returns a unit ONLY if it is explicitly present in the segment,
// else null — so range parsing can decide whether to inherit the sibling's unit.
function explicitUnitOf(seg: string): SizeUnit | null {
  if (/\bbillion\b|\bbn\b/i.test(seg)) return 'billion_inr';
  if (/(usd|us\$|\$|dollar)/i.test(seg) && /\bm(?:illion)?\b|\bmn\b/i.test(seg)) return 'million_usd';
  if (/\binr\b/i.test(seg) && /\bm(?:illion)?\b|\bmn\b/i.test(seg)) return 'million_inr';
  if (/\bcr(?:ore)?s?\b/i.test(seg)) return 'cr';
  if (/\blakhs?\b|\blacs?\b/i.test(seg)) return 'lakh';
  if (/\bm(?:illion)?\b|\bmn\b/i.test(seg)) return 'million_inr';
  return null;
}

function toCr(value: number, unit: SizeUnit): number {
  switch (unit) {
    case 'cr':          return Math.round(value * 100) / 100;
    case 'lakh':        return Math.round((value / 100) * 100) / 100;   // 100 lakh = 1 Cr
    case 'million_inr': return Math.round((value / 10) * 100) / 100;    // 10M INR = 1 Cr
    case 'million_usd': return Math.round((value * 83 / 10) * 100) / 100; // 1 USD ≈ 83 INR → M USD / 10 = Cr approx
    case 'billion_inr': return Math.round((value * 100) * 100) / 100;  // 1 billion INR = 100 Cr
    default:            return Math.round(value * 100) / 100;
  }
}

// ─────────────────────────────────────────────────────────────
// NORMALIZE INTENT
// Canonicalizes raw intent strings to DealIntent enum values.
// Handles LLM output variations, user typos, and raw text signals.
// ─────────────────────────────────────────────────────────────

const INTENT_ALIASES: Record<string, DealIntent> = {
  // SELL_SIDE
  sell_side:             'SELL_SIDE',
  sell:                  'SELL_SIDE',
  exit:                  'SELL_SIDE',
  divestiture:           'SELL_SIDE',
  divestment:            'SELL_SIDE',
  seller:                'SELL_SIDE',
  // BUY_SIDE
  buy_side:              'BUY_SIDE',
  buy:                   'BUY_SIDE',
  acquire:               'BUY_SIDE',
  acquisition:           'BUY_SIDE',
  buyer:                 'BUY_SIDE',
  invest:                'BUY_SIDE',
  investment:            'BUY_SIDE',
  // FUNDRAISING
  fundraising:           'FUNDRAISING',
  fundraise:             'FUNDRAISING',
  raise:                 'FUNDRAISING',
  raise_equity:          'FUNDRAISING',
  equity_raise:          'FUNDRAISING',
  // DEBT
  debt:                  'DEBT',
  loan:                  'DEBT',
  borrow:                'DEBT',
  credit:                'DEBT',
  debt_financing:        'DEBT',
  // STRATEGIC_PARTNERSHIP
  strategic_partnership: 'STRATEGIC_PARTNERSHIP',
  partner:               'STRATEGIC_PARTNERSHIP',
  partnership:           'STRATEGIC_PARTNERSHIP',
  jv:                    'STRATEGIC_PARTNERSHIP',
  joint_venture:         'STRATEGIC_PARTNERSHIP',
  strategic:             'STRATEGIC_PARTNERSHIP',
};

// Phase 2.3: only these five values are valid intents. Anything else → null.
const VALID_INTENTS: string[] = ['SELL_SIDE', 'BUY_SIDE', 'FUNDRAISING', 'DEBT', 'STRATEGIC_PARTNERSHIP'];

export function normalizeIntent(intent: string | null | undefined): DealIntent {
  if (!intent) return null;
  const clean = intent.trim().toLowerCase().replace(/\s+/g, '_');
  const aliased = INTENT_ALIASES[clean];
  if (aliased) return aliased;
  // Accept a raw value ONLY if it already matches a canonical enum; reject junk
  // like "acquihire" instead of upcasing it into a fake DealIntent that gets stored.
  const upper = clean.toUpperCase();
  return VALID_INTENTS.includes(upper) ? (upper as DealIntent) : null;
}

// ─────────────────────────────────────────────────────────────
// COMPUTE QUALITY SCORE
// Delegates to computeQualityGate() and returns the numeric score.
// Separate from qualityGate.ts so callers that only need the score
// don't need to import the full QualityGateResult.
// ─────────────────────────────────────────────────────────────

export function computeQualityScore(state: RouterState): number {
  return computeQualityGate(state).score;
}

// ─────────────────────────────────────────────────────────────
// QUALITY TIER FROM SCORE
// Converts a 0–10 quality score to a Tier label.
//   Tier 1 (Rich)     — 8–10: all key fields present
//   Tier 2 (Adequate) — 5–7:  most fields present
//   Tier 3 (Thin)     — 2–4:  minimal fields
//   Tier 4 (Stub)     — 0–1:  essentially empty
// ─────────────────────────────────────────────────────────────

export function qualityTierFromScore(score: number): 1 | 2 | 3 | 4 {
  if (score >= 8) return 1;
  if (score >= 5) return 2;
  if (score >= 2) return 3;
  return 4;
}
