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
        case 'cr': return Math.round(value * 100) / 100;
        case 'lakh': return Math.round((value / 100) * 100) / 100;   // 100 lakh = 1 Cr
        case 'million_inr': return Math.round((value / 10) * 100) / 100;    // 10M INR = 1 Cr
        case 'million_usd': return Math.round((value * 83 / 10) * 100) / 100; // 1 USD ≈ 83 INR → M USD / 10 = Cr approx
        case 'billion_inr': return Math.round((value * 100) * 100) / 100;  // 1 billion INR = 100 Cr
        default: return Math.round(value * 100) / 100;
    }
}

// ─────────────────────────────────────────────────────────────
// NORMALIZE INTENT
// Canonicalizes raw intent strings to DealIntent enum values.
// Handles LLM output variations, user typos, and raw text signals.
// ─────────────────────────────────────────────────────────────

const INTENT_ALIASES: Record<string, DealIntent> = {
    // SELL_SIDE
    sell_side: 'SELL_SIDE',
    sell: 'SELL_SIDE',
    exit: 'SELL_SIDE',
    divestiture: 'SELL_SIDE',
    divestment: 'SELL_SIDE',
    seller: 'SELL_SIDE',
    // BUY_SIDE
    buy_side: 'BUY_SIDE',
    buy: 'BUY_SIDE',
    acquire: 'BUY_SIDE',
    acquisition: 'BUY_SIDE',
    buyer: 'BUY_SIDE',
    invest: 'BUY_SIDE',
    investment: 'BUY_SIDE',
    // FUNDRAISING
    fundraising: 'FUNDRAISING',
    fundraise: 'FUNDRAISING',
    raise: 'FUNDRAISING',
    raise_equity: 'FUNDRAISING',
    equity_raise: 'FUNDRAISING',
    // DEBT
    debt: 'DEBT',
    loan: 'DEBT',
    borrow: 'DEBT',
    credit: 'DEBT',
    debt_financing: 'DEBT',
    // STRATEGIC_PARTNERSHIP
    strategic_partnership: 'STRATEGIC_PARTNERSHIP',
    partner: 'STRATEGIC_PARTNERSHIP',
    partnership: 'STRATEGIC_PARTNERSHIP',
    jv: 'STRATEGIC_PARTNERSHIP',
    joint_venture: 'STRATEGIC_PARTNERSHIP',
    strategic: 'STRATEGIC_PARTNERSHIP',
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