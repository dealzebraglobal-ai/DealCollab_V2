/**
 * DealCollab — M5: Industry Gate (HR-9)
 * =====================================
 * Place at: src/lib/M5_industryGate.ts
 *
 * Why this exists: the coarse sector tag cannot tell an oral-solid CDMO from a flexible-packaging
 * supplier (both are tagged pharma), and getIndustryCompatibility() falls back to that tag whenever
 * two industries differ without a hand-written rule, so different businesses score as
 * "same-sector consolidation". This gate compares the two TRUE industry labels directly, by
 * embedding similarity, and rejects the pair when they are different businesses.
 * Pure functions only — the embedding call lives in matchmakingEngine.ts.
 *
 * Exports:
 *   INDUSTRY_GATE_MIN   — similarity cutoff (PROVISIONAL until calibrated)
 *   trueIndustry()      — the real industry label, or null when missing / just the sector tag
 *   cosineSimilarity()  — cosine of two vectors
 *   industryGate()      — HR-9 decision for one pair
 */

import { normalizeSector } from './M5_sectorMatrix';

// PROVISIONAL — not calibrated on real embeddings yet. Before deploying, run
// `npx tsx scripts/calibrateIndustryGate.ts` and set this to the cutoff it prints.
export const INDUSTRY_GATE_MIN = 0.5;

/**
 * The actual industry label, or null when it is missing or merely repeats the coarse sector tag.
 * (match_proposals returns sectors[1] as "industry" when no industry is stored; a label that is
 * just the sector tag says nothing about the business.)
 */
export function trueIndustry(industry: string | null | undefined, sector: string | null | undefined): string | null {
    const ind = (industry ?? '').trim();
    if (!ind) return null;
    if (sector && normalizeSector(ind) === normalizeSector(sector)) return null;
    return ind;
}

export function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

/** HR-9 decision for one pair. `similarity` is the cosine of the two industry-label embeddings. */
export function industryGate(
    sourceIndustry: string | null,
    candidateIndustry: string | null,
    similarity: number | null,
): { rejected: boolean; reason?: string } {
    // Generalist mandate (no industry stated): nothing to compare against, the gate does not apply.
    if (!sourceIndustry) return { rejected: false };
    if (!candidateIndustry) {
        return { rejected: true, reason: 'HR-9: candidate industry unknown — business fit cannot be verified' };
    }
    if (similarity === null) {
        return { rejected: true, reason: 'HR-9: industry similarity unavailable' };
    }
    if (similarity < INDUSTRY_GATE_MIN) {
        return {
            rejected: true,
            reason: `HR-9: different business — "${candidateIndustry}" vs "${sourceIndustry}" (similarity ${similarity.toFixed(2)} < ${INDUSTRY_GATE_MIN})`,
        };
    }
    return { rejected: false };
}