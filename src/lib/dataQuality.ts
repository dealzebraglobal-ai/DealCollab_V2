// src/lib/dataQuality.ts
/**
 * DealCollab — Data Quality Layer (L1 Ingestion)
 * ==============================================
 * Single source of truth for all mandate normalization.
 * Used by: route.ts (chat closure), scripts/seed-embeddings.ts (CSV seed),
 *          future /api/mandates endpoints.
 *
 * DOES NOT replace: any extraction logic, the LLM call, or M0-M6 modules.
 * Runs AFTER extraction, BEFORE persistence/embedding.
 */

import type { DealIntent } from './promptRouter';

// ─────────────────────────────────────────────────────────────
// 1. ENCODING REPAIR (124/1370 real proposals had mojibake)
// ─────────────────────────────────────────────────────────────

const MOJIBAKE_MAP: Array<[string, string]> = [
    ['â€"', '—'],
    ['â€"', '–'],
    ['â€˜', '\u2018'],
    ['â€™', '\u2019'],
    ['â€œ', '\u201C'],
    ['â€', '\u201D'],
    ['â‚¹', '₹'],
    ['Â ', ' '],
    ['\u00A0', ' '],
    ['\uFEFF', ''],
];

export function fixEncoding(text: string): string {
    if (!text) return '';
    let out = text;
    for (const [bad, good] of MOJIBAKE_MAP) out = out.split(bad).join(good);
    return out.trim();
}

// ─────────────────────────────────────────────────────────────
// 2. INTENT CANONICALIZATION
// ─────────────────────────────────────────────────────────────

export function normalizeIntent(raw: string | null | undefined): DealIntent {
    if (!raw) return null;
    const s = raw.trim().toLowerCase().replace(/[\s_-]+/g, '_');

    if (['buy_side', 'buy', 'buyer', 'acquirer', 'acquisition'].includes(s)) return 'BUY_SIDE';
    if (['sell_side', 'sell', 'seller', 'exit', 'divest', 'divestment'].includes(s)) return 'SELL_SIDE';
    if (['investment', 'investor', 'investing'].includes(s)) return 'BUY_SIDE'; // RC4: financial investor = buy-side
    if (['fundraising', 'fundraise', 'raise', 'capital_raise'].includes(s)) return 'FUNDRAISING';
    if (['debt', 'loan', 'financing', 'structured_finance'].includes(s)) return 'DEBT';
    if (['strategic_partnership', 'partnership', 'jv', 'joint_venture'].includes(s)) return 'STRATEGIC_PARTNERSHIP';

    return null;
}

// ─────────────────────────────────────────────────────────────
// 3. SIZE NORMALIZATION → INR Crore
// ─────────────────────────────────────────────────────────────

const USD_TO_INR = 83;

export type SizeUnit = 'cr' | 'lakh' | 'million_usd' | 'million_inr' | 'billion' | 'plain' | 'unknown';

export interface NormalizedSize {
    min_cr: number | null;
    max_cr: number | null;
    raw: string;
    unit_detected: SizeUnit;
}

function toNum(s: string): number {
    return parseFloat(s.replace(/,/g, ''));
}

const SIZE_PATTERNS: Array<{ re: RegExp; build: (m: RegExpMatchArray) => NormalizedSize }> = [
    // Range in Cr
    {
        re: /(?:₹|rs\.?|inr)?\s*(\d[\d.,]*)\s*(?:to|[-–—])\s*(\d[\d.,]*)\s*(?:cr|crore)s?\b/i,
        build: (m) => ({ min_cr: toNum(m[1]), max_cr: toNum(m[2]), raw: m[0], unit_detected: 'cr' }),
    },
    // Single Cr
    {
        re: /(?:₹|rs\.?|inr)?\s*(\d[\d.,]*)\s*(?:cr|crore)s?\b/i,
        build: (m) => ({ min_cr: toNum(m[1]), max_cr: toNum(m[1]), raw: m[0], unit_detected: 'cr' }),
    },
    // Range in lakh
    {
        re: /(?:₹|rs\.?|inr)?\s*(\d[\d.,]*)\s*(?:to|[-–—])\s*(\d[\d.,]*)\s*(?:lac|lacs|lakh|lakhs)\b/i,
        build: (m) => ({ min_cr: toNum(m[1]) / 100, max_cr: toNum(m[2]) / 100, raw: m[0], unit_detected: 'lakh' }),
    },
    // Single lakh
    {
        re: /(?:₹|rs\.?|inr)?\s*(\d[\d.,]*)\s*(?:lac|lacs|lakh|lakhs)\b/i,
        build: (m) => ({ min_cr: toNum(m[1]) / 100, max_cr: toNum(m[1]) / 100, raw: m[0], unit_detected: 'lakh' }),
    },
    // $50M / USD 50 million
    {
        re: /(?:\$|usd\s*)(\d[\d.,]*)\s*(?:m\b|mn\b|million)/i,
        build: (m) => {
            const cr = (toNum(m[1]) * USD_TO_INR) / 10;
            return { min_cr: cr, max_cr: cr, raw: m[0], unit_detected: 'million_usd' };
        },
    },
    // 50 million USD (trailing currency)
    {
        re: /(\d[\d.,]*)\s*(?:m\b|mn\b|million)\s*(?:usd|\$)/i,
        build: (m) => {
            const cr = (toNum(m[1]) * USD_TO_INR) / 10;
            return { min_cr: cr, max_cr: cr, raw: m[0], unit_detected: 'million_usd' };
        },
    },
    // INR million / generic million
    {
        re: /(\d[\d.,]*)\s*(?:mn\b|million)\b/i,
        build: (m) => ({ min_cr: toNum(m[1]) / 10, max_cr: toNum(m[1]) / 10, raw: m[0], unit_detected: 'million_inr' }),
    },
    // Billion
    {
        re: /(\d[\d.,]*)\s*(?:bn|billion)\b/i,
        build: (m) => ({ min_cr: toNum(m[1]) * 100, max_cr: toNum(m[1]) * 100, raw: m[0], unit_detected: 'billion' }),
    },
];

export function normalizeSize(text: string): NormalizedSize | null {
    if (!text) return null;
    for (const { re, build } of SIZE_PATTERNS) {
        const m = text.match(re);
        if (m) return build(m);
    }
    return null;
}

// ─────────────────────────────────────────────────────────────
// 4. CAPACITY DETECTION (renewable, realestate, oil_gas)
// ─────────────────────────────────────────────────────────────

export interface DetectedCapacity {
    value: number;
    unit: 'MW' | 'sqft' | 'acres' | 'MMTPA' | 'KL';
    raw: string;
}

export function detectCapacity(text: string): DetectedCapacity | null {
    if (!text) return null;
    const t = text.toLowerCase();

    const mw = t.match(/(\d[\d.,]*)\s*mw\b/);
    if (mw) return { value: toNum(mw[1]), unit: 'MW', raw: mw[0] };

    const sqft = t.match(/(\d[\d.,]*)\s*(?:lakh|lac)?\s*(?:sq\.?\s*ft|sqft)/);
    if (sqft) {
        const multiplier = /lakh|lac/.test(sqft[0]) ? 100000 : 1;
        return { value: toNum(sqft[1]) * multiplier, unit: 'sqft', raw: sqft[0] };
    }

    const acres = t.match(/(\d[\d.,]*)\s*acres?\b/);
    if (acres) return { value: toNum(acres[1]), unit: 'acres', raw: acres[0] };

    const mmtpa = t.match(/(\d[\d.,]*)\s*mmtpa\b/);
    if (mmtpa) return { value: toNum(mmtpa[1]), unit: 'MMTPA', raw: mmtpa[0] };

    const kl = t.match(/(\d[\d.,]*)\s*kl\b/);
    if (kl) return { value: toNum(kl[1]), unit: 'KL', raw: kl[0] };

    return null;
}

// ─────────────────────────────────────────────────────────────
// 5. QUALITY SCORING — DC-MATCH-001 §3.3
// ─────────────────────────────────────────────────────────────

export interface QualityInput {
    rawText: string;
    intent: string | null;
    sector: string | null;
    geography: string | null;
    deal_size_min_cr: number | null;
    revenue_min_cr: number | null;
    structure: string | null;
    industry_data?: Record<string, unknown>;
}

export function computeQualityScore(input: QualityInput): number {
    let score = 0;
    const len = (input.rawText || '').trim().length;

    if (len < 20) return 0;
    if (len < 40) score += 1;
    else if (len < 100) score += 2;
    else if (len < 200) score += 3;
    else score += 4;

    if (input.intent) score += 1;
    if (input.sector) score += 1;
    if (input.geography) score += 1;
    if (input.deal_size_min_cr || input.revenue_min_cr) score += 2;
    if (input.structure) score += 1;

    return Math.min(score, 10);
}

export type QualityTier = 1 | 2 | 3 | 4;

export function qualityTierFromScore(score: number): QualityTier {
    if (score >= 8) return 1;
    if (score >= 5) return 2;
    if (score >= 3) return 3;
    return 4;
}