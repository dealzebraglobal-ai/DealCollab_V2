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

// Shell company signal patterns — companies that exist on paper only
const SHELL_SIGNALS = [
    /turnover[:\s]*zero/i,
    /annual turnover[:\s]*nil/i,
    /turnover[:\s]*nil/i,
    /zero turnover/i,
    /no turnover/i,
    /no business activity/i,
    /non[- ]operative/i,
    /dormant company/i,
    /psc[:\s]*(?:₹?\s*)?[1-9]\s*lakh/i,        // paid-up share capital ≤ 9 lakh
    /paid[- ]up capital[:\s]*(?:₹?\s*)?[1-9]\s*lakh/i,
    /inc[- ]20a/i,                                // INC-20A is a dormancy declaration
    /shell company/i,
    /kindly\s+dm\s+me?\b/i,                       // "please DM me" = no real description
    /anyone\s+interested\s*,?\s*dm/i,
    /available\s+for\s+sale\.?\s*(please\s+dm|anyone\s+interested|dm)/i,
    /company\s+available\s+for\s+sale/i,
    /company\s+for\s+sell?[:\-|]?/i,              // "Company for sell:- 1. Year:..." template
    /price\s*[:\-]?\s*(?:very\s*)*cheap/i,
    /nature of business\s+trading/i,             // Trading companies falsely tagged as SaaS
    /trading\s+[na&]\s+distribution/i,           // Trading & Distribution
    /trading\s+and\s+distribution/i,
];

/**
 * Text signals that CONTRADICT a claimed sector.
 * If a proposal claims 'saas' but the text says "Trading & Distribution", reject it.
 */
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

// SaaS-specific legitimacy signals — must mention product/platform/revenue characteristics
const SAAS_LEGITIMACY_SIGNALS = [
    /\brecurring revenue\b/i,
    /\barr\b/i,
    /\bsaas\s+(?:platform|product|solution|tool|software)\b/i,
    /\bsubscription(?:\s+model|\s+revenue)?\b/i,
    /\bmonthly\s+recurring\b/i,
    /\benterprise\s+(?:client|contract|saas)\b/i,
    /\bchurn\b/i,
    /\b(?:api|sdk|cloud[- ]native|multi[- ]tenant)\b/i,
    /\bproprietary\s+(?:platform|software|technology)\b/i,
];

// Digital marketing / MarTech classification signals
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

/** Returns true if at least 2 digital marketing signals fire (avoids single-word false positives). */
export function isDigitalMarketing(rawText: string): boolean {
    if (!rawText) return false;
    return DIGITAL_MARKETING_SIGNALS.filter(re => re.test(rawText)).length >= 2;
}

/**
 * Returns a 0–100 shell company risk score.
 * Hard signals (SHELL_SIGNALS regex hits) = 30 pts each.
 * Soft signals (keyword matches) = 10 pts each.
 * Capped at 100. Threshold: ≥40 = moderate risk, ≥70 = high risk.
 */
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

/**
 * Returns true if the raw_text strongly indicates a shell/dormant company
 * with no real operational SaaS business.
 */
export function isShellCompany(rawText: string): boolean {
    if (!rawText) return false;
    
    // 1. Strict regex hits
    const shellHits = SHELL_SIGNALS.filter(re => re.test(rawText)).length;
    if (shellHits >= 1) return true; // Even one hard signal is enough
    
    // 2. Multi-signal hits (synchronized with promptRouter detection)
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
    if (score >= 2) return true;

    return false;
}

// ─────────────────────────────────────────────────────────────
// HARD EXCLUSION PATTERNS
// Companies matching these are excluded from ALL results unless user explicitly
// requests shell/dormant/SPV entities (sub_sector='shell_company' query).
// ─────────────────────────────────────────────────────────────

export const HARD_EXCLUSION_SIGNALS: RegExp[] = [
    // Compliance/certificate assets for sale (not businesses)
    /\bgst\s+(?:number|no\.?|registration)?\s*(?:for\s+)?(?:sale|available|transfer)\b/i,
    /\btrademark\s+(?:for\s+)?(?:sale|transfer|available)\b/i,
    /\biso\s+(?:certificate|certified)?\s*(?:for\s+)?(?:sale|transfer|available)\b/i,
    /\bfssai\s+(?:for\s+)?(?:sale|transfer|available)\b/i,
    /\bdrug\s+license\s+(?:for\s+)?(?:sale|transfer|available)\b/i,
    // Dormant / inactive / no operations
    /\bdormant\s+(?:company|entity|firm)\b/i,
    /\binactive\s+(?:company|entity|business|firm)\b/i,
    /\bno\s+(?:business\s+)?operations?\b/i,
    /\bnon[- ]operative\b/i,
    /\bnon[- ]operational\b/i,
    /\bblank\s+(?:company|entity)\b/i,
    /\bpaper\s+company\b/i,
    // Special purpose / shelf / holding-only entities
    /\bspv\b/i,
    /\bshelf\s+company\b/i,
    /\bholding\s+(?:structure\s+)?only\b/i,
    /\bcompliance[- ]only\b/i,
    // Solicitation templates (zero operational detail)
    /anyone\s+interested\s*[,]?\s*(?:dm|contact|whatsapp)/i,
    /\bkindly\s+(?:dm|whatsapp|message)\s+me\b/i,
    /\bprice\s*[:\-]?\s*(?:very\s*)?cheap\b/i,
    /company\s+for\s+sell?[:\s|\-]/i,
    /available\s+for\s+(?:sale|acquisition)[.\s]*(?:please\s+)?(?:dm|contact|whatsapp)/i,
    // INC-20A dormancy declaration
    /\binc[- ]20a\b/i,
    // Corporate acquisition broker patterns (shell marketplace, not M&A)
    // e.g. "Required 6 months old company with GST", "Required Delhi GST 1 yr old"
    /\brequired?\s+\d+\s*(?:yr|year|month)s?\s+old\s+company\b/i,
    /\bnon[- ]?gst\s+company\s+(?:available|for\s+sale)\b/i,
    /\bwithout\s+gst\s*[,.]?\s*capital\s*[=:]/i,
    /\bcompany\s+available\s+for\s+sale\b/i,
    /\bcompany\s+for\s+sale\b/i,
    /\bpvt\.?\s*ltd\.?\s+(?:company\s+)?(?:for\s+)?(?:sale|available)\b/i,
    // NBFC / listed company shells (compliance market, not operational M&A)
    /\bnbfc\s+(?:for\s+)?(?:sale|available|transfer)\b/i,
    /\b(?:bse|nse)[- ]listed\s+company\s+(?:for\s+)?(?:sale|available|transfer)\b/i,
    /\bunlisted\s+(?:company|nbfc)\s+(?:for\s+)?(?:sale|available)\b/i,
    /\bnof\s*[=:]\s*[\d.]+\s*(?:cr|crore)\b/i,  // "NOF: 5.5 cr" — NBFC Net Owned Funds metric
];

/**
 * Returns true if a proposal should be hard-excluded from all match results.
 * exempt=true when the user explicitly wants shell/dormant entities.
 */
export function isHardExcluded(rawText: string, exempt = false): boolean {
    if (!rawText || exempt) return false;
    return HARD_EXCLUSION_SIGNALS.some(re => re.test(rawText));
}

// ─────────────────────────────────────────────────────────────
// DIGITAL MARKETING OPERATIONAL CONTENT
// For queries with sub_sector='digital_marketing', candidates MUST show
// actual operational marketing activity — not just a generic SaaS label.
// ─────────────────────────────────────────────────────────────

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

/**
 * Returns 0–1 relevance score for digital marketing operational content.
 * Requires at least 1 signal; 3+ signals → 1.0.
 */
export function digitalMarketingRelevanceScore(rawText: string): number {
    if (!rawText) return 0;
    const hits = DIGITAL_MARKETING_OPERATIONAL.filter(re => re.test(rawText)).length;
    return Math.min(1.0, hits / 3);
}

// ─────────────────────────────────────────────────────────────
// OPERATIONAL RICHNESS SCORING
// Measures how much real operational content a proposal has.
// Skeleton/boilerplate proposals (ROC data, object clause, capital info)
// score near 0. Genuine descriptions with clients, revenue, products score high.
// ─────────────────────────────────────────────────────────────

const BOILERPLATE_SIGNALS: RegExp[] = [
    /\bobjects?\s*[:\-|]/i,                      // "Objects: Software development"
    /\bauthoised\s+(?:share\s+)?capital\b/i,
    /\bauthorised\s+(?:share\s+)?capital\b/i,
    /\bpaid[- ]up\s+(?:share\s+)?capital\b/i,
    /\bcin\s+[lu][0-9]/i,                        // CIN number
    /\bdin\s+[0-9]{8}/i,                         // DIN number
    /\broc\s+(?:compliant|registered|filing)/i,
    /\bregistered\s+under\s+(?:the\s+)?companies\s+act/i,
    /\bgst\s+(?:registered|active|compliant)\b/i,
    /\bit\s+(?:returns?\s+)?(?:filed|compliant)\b/i,
    /\bnature\s+of\s+business\s*[:\-]?\s*(?:it|software|digital|technology)\b/i,
    /\bdate\s+of\s+(?:incorporation|registration)\b/i,
    /year\s+of\s+(?:incorporation|establishment)\s*[:\-]?\s*\d{4}/i,
];

/**
 * Returns 0–1 score of how operationally rich the content is.
 * 1.0 = detailed real business description. 0 = skeleton / boilerplate only.
 */
export function operationalRichnessScore(rawText: string): number {
    if (!rawText) return 0;
    const text = rawText.trim();
    if (text.length < 40) return 0;

    const boilerplateHits = BOILERPLATE_SIGNALS.filter(re => re.test(text)).length;

    // Base richness from content length (caps at 600 chars for full credit)
    const lengthScore = Math.min(1.0, text.length / 600);

    // Each boilerplate hit reduces richness — a pure ROC-dump scores near 0
    const boilerplatePenalty = Math.min(0.8, boilerplateHits * 0.15);

    return Math.max(0, lengthScore - boilerplatePenalty);
}

/**
 * Returns false if a proposal's claimed sector is contradicted by its actual text.
 * e.g. a "Trading & Distribution" company claiming sector='saas' → false.
 */
export function isSectorLegitimate(claimedSector: string | null, rawText: string | null): boolean {
    if (!claimedSector || !rawText) return true; // can't disprove → allow
    const contradictions = SECTOR_CONTRADICTIONS[claimedSector.toLowerCase()];
    if (!contradictions) return true;
    // If ANY contradiction pattern fires, the sector claim is illegitimate
    return !contradictions.some(re => re.test(rawText));
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

    // Penalize shell company signals heavily
    if (isShellCompany(input.rawText)) score = Math.max(0, score - 5);

    // Hard cap for very thin proposals — under 80 chars cannot be meaningfully matched
    if (len < 80) score = Math.min(score, 2);

    return Math.min(score, 10);
}

export type QualityTier = 1 | 2 | 3 | 4;

export function qualityTierFromScore(score: number): QualityTier {
    if (score >= 8) return 1;
    if (score >= 5) return 2;
    if (score >= 3) return 3;
    return 4;
}