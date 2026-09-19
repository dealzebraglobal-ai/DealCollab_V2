/**
 * DealCollab — Industry separability (PURE)
 * =========================================
 * Place at: scripts/lib/industrySeparation.ts
 *
 * Zero I/O. Zero imports. Pure functions only, so it is harness-testable
 * without touching OpenAI or the database.
 *
 * Owned by this file:
 *   ✔ INDUSTRY_PAIRS      — the labelled ground-truth set
 *   ✔ cosine()
 *   ✔ findBestThreshold() — can a single cosine cutoff reproduce the labels?
 *
 * NOT owned:
 *   ✘ embedding calls / reporting → probe-industry-separation.ts
 */

export type Verdict = 'ACCEPT' | 'REJECT' | 'UNDECIDED';

export interface IndustryPair {
    a: string;
    b: string;
    /** UNDECIDED pairs are reported but excluded from threshold fitting. */
    expect: Verdict;
    source: string;
}

/**
 * Ground truth. The four ACCEPT/REJECT rulings came from the mandate owner
 * (answers to Q5). The rest are the real failures from the match audit doc.
 * UNDECIDED pairs need a ruling before they can be used to fit anything.
 */
export const INDUSTRY_PAIRS: IndustryPair[] = [
    // ── Owner rulings (Q5) ────────────────────────────────────────────
    { a: 'Garments — Outerwear', b: 'Garments — Innerwear', expect: 'ACCEPT', source: 'Q5 ruling' },
    { a: 'Active Pharmaceutical Ingredients (API)', b: 'Pharma Formulations / CDMO', expect: 'ACCEPT', source: 'Q5 ruling' },
    { a: 'Home Textiles', b: 'Apparel / Garments', expect: 'REJECT', source: 'Q5 ruling' },
    { a: 'Sheet Metal Fabrication', b: 'Plastic Injection Molding', expect: 'REJECT', source: 'Q5 ruling' },

    // ── Live failures from the audit doc (all must land REJECT) ───────
    { a: 'Toys', b: 'Sheet Metal Fabrication', expect: 'REJECT', source: 'audit Q1→P1 (scored 85%)' },
    { a: 'Home Textiles', b: 'Sheet Metal Fabrication', expect: 'REJECT', source: 'audit Q2→P2 (scored 83%)' },
    { a: 'Garments — Contract Manufacturing', b: 'Sheet Metal Fabrication', expect: 'REJECT', source: 'audit Q3→P2 (scored 86%)' },
    { a: 'Integrated OT Security & Applied AI', b: 'Precision Engineering / Auto Components', expect: 'REJECT', source: 'audit Q4→P2 (scored 81%)' },
    { a: 'Pharmaceutical Manufacturing', b: 'Enterprise SaaS', expect: 'REJECT', source: 'audit Q5→P1 (scored 75%)' },
    { a: 'Pharmaceutical Manufacturing', b: 'Multi-specialty Hospital', expect: 'REJECT', source: 'audit Q5→P2 (scored 74%)' },

    // ── Synonym controls (must land ACCEPT or the gate blocks real deals) ──
    { a: 'Toys', b: 'Toy Manufacturing', expect: 'ACCEPT', source: 'synonym control' },
    { a: 'Pharmaceutical Manufacturing', b: 'Pharma Formulations', expect: 'ACCEPT', source: 'synonym control' },
    { a: 'Auto Components', b: 'Auto Ancillary Manufacturing', expect: 'ACCEPT', source: 'synonym control' },
    { a: 'Freshwater Aquaculture (RAS)', b: 'Shrimp Aquaculture & Processing', expect: 'ACCEPT', source: 'synonym control' },

    // ── Needs an owner ruling before use ──────────────────────────────
    { a: 'Multi-specialty Hospital', b: 'Diagnostics Chain', expect: 'UNDECIDED', source: 'needs ruling' },
    { a: 'Sheet Metal Fabrication', b: 'CNC Machining', expect: 'UNDECIDED', source: 'needs ruling' },
    { a: 'Enterprise SaaS', b: 'OT / Industrial Cybersecurity', expect: 'UNDECIDED', source: 'needs ruling' },
];

export interface ScoredPair extends IndustryPair {
    cos: number;
}

export interface SeparationReport {
    /** true when one cutoff classifies every ACCEPT/REJECT pair correctly. */
    separable: boolean;
    /** Chosen cutoff: pairs with cos >= threshold are treated as ACCEPT. */
    threshold: number | null;
    /** minAccept - maxReject. Positive = clean gap. Negative = overlap. */
    margin: number;
    minAccept: number;
    maxReject: number;
    correct: number;
    total: number;
    misclassified: ScoredPair[];
}

export function cosine(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
        throw new Error(`cosine: length mismatch ${a.length} vs ${b.length}`);
    }
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
}

function countCorrect(scored: ScoredPair[], threshold: number): number {
    return scored.filter(p =>
        p.expect === 'ACCEPT' ? p.cos >= threshold : p.cos < threshold,
    ).length;
}

/**
 * Can a single cosine cutoff reproduce the labels?
 *
 * Returns the cutoff that classifies the most pairs correctly. When the
 * ACCEPT and REJECT clusters do not overlap, `separable` is true and the
 * threshold sits midway in the gap. When they overlap, `separable` is false
 * and `misclassified` names every pair the best possible cutoff still gets
 * wrong — that is the evidence that a curated matrix is required instead.
 */
export function findBestThreshold(scored: ScoredPair[]): SeparationReport {
    const labelled = scored.filter(p => p.expect !== 'UNDECIDED');
    const accepts = labelled.filter(p => p.expect === 'ACCEPT');
    const rejects = labelled.filter(p => p.expect === 'REJECT');

    if (accepts.length === 0 || rejects.length === 0) {
        return {
            separable: false, threshold: null, margin: 0,
            minAccept: 0, maxReject: 0,
            correct: 0, total: labelled.length, misclassified: [],
        };
    }

    const minAccept = Math.min(...accepts.map(p => p.cos));
    const maxReject = Math.max(...rejects.map(p => p.cos));
    const margin = minAccept - maxReject;

    // Candidate cutoffs: midpoints between every adjacent pair of observed
    // scores, plus the endpoints. Exhaustive at this data size.
    const sorted = [...labelled].map(p => p.cos).sort((x, y) => x - y);
    const candidates = [sorted[0] - 0.01, ...sorted.map((v, i) =>
        i === sorted.length - 1 ? v + 0.01 : (v + sorted[i + 1]) / 2,
    )];

    let best = candidates[0];
    let bestCorrect = -1;
    for (const t of candidates) {
        const c = countCorrect(labelled, t);
        // Tie-break toward the cutoff furthest from any observed score, so the
        // reported threshold is the most robust of the equally-accurate ones.
        if (c > bestCorrect) { bestCorrect = c; best = t; }
    }

    const threshold = margin > 0 ? (minAccept + maxReject) / 2 : best;
    const correct = countCorrect(labelled, threshold);

    return {
        separable: margin > 0 && correct === labelled.length,
        threshold,
        margin,
        minAccept,
        maxReject,
        correct,
        total: labelled.length,
        misclassified: labelled.filter(p =>
            p.expect === 'ACCEPT' ? p.cos < threshold : p.cos >= threshold,
        ),
    };
}