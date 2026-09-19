/**
 * DealCollab — Harness: industrySeparation
 * ========================================
 * Place at: scripts/lib/industrySeparation.test.ts
 * Run with: npx tsx scripts/lib/industrySeparation.test.ts
 *
 * No test framework dependency. Exits non-zero on failure.
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
    cosine, findBestThreshold, INDUSTRY_PAIRS,
    type ScoredPair, type IndustryPair,
} from './industrySeparation';

const pair = (expect: 'ACCEPT' | 'REJECT' | 'UNDECIDED', cos: number, a = 'x', b = 'y'): ScoredPair =>
    ({ a, b, expect, source: 'test', cos });

describe('industrySeparation', () => {
    it('cosine: identical vectors = 1', () => {
        assert.equal(Math.round(cosine([1, 2, 3], [1, 2, 3]) * 1e6) / 1e6, 1);
    });

    it('cosine: orthogonal vectors = 0', () => {
        assert.equal(cosine([1, 0], [0, 1]), 0);
    });

    it('cosine: magnitude-invariant', () => {
        assert.equal(Math.round(cosine([1, 2], [10, 20]) * 1e6) / 1e6, 1);
    });

    it('cosine: rejects mismatched lengths', () => {
        assert.throws(() => cosine([1, 2], [1, 2, 3]), /length mismatch/);
    });

    it('clean gap -> separable, threshold lands inside the gap', () => {
        const r = findBestThreshold([
            pair('ACCEPT', 0.90), pair('ACCEPT', 0.85),
            pair('REJECT', 0.50), pair('REJECT', 0.42),
        ]);
        assert.equal(r.separable, true);
        assert.ok(r.threshold! > 0.50 && r.threshold! < 0.85, `threshold ${r.threshold} not in gap`);
        assert.equal(Math.round(r.margin * 100) / 100, 0.35);
        assert.equal(r.misclassified.length, 0);
        assert.equal(r.correct, 4);
    });

    it('overlapping clusters -> NOT separable, names the offenders', () => {
        const r = findBestThreshold([
            pair('ACCEPT', 0.72, 'garments-outer', 'garments-inner'),
            pair('ACCEPT', 0.60, 'api', 'formulations'),
            pair('REJECT', 0.78, 'toys', 'sheet-metal'),   // scores ABOVE a real accept
            pair('REJECT', 0.40, 'pharma', 'saas'),
        ]);
        assert.equal(r.separable, false);
        assert.ok(r.margin < 0, `margin should be negative, got ${r.margin}`);
        assert.ok(r.misclassified.length >= 1);
        assert.ok(r.correct < r.total, 'best cutoff should still get something wrong');
    });

    it('UNDECIDED pairs are excluded from fitting', () => {
        const r = findBestThreshold([
            pair('ACCEPT', 0.90), pair('REJECT', 0.40),
            pair('UNDECIDED', 0.65), pair('UNDECIDED', 0.99),
        ]);
        assert.equal(r.total, 2);
        assert.equal(r.separable, true);
        assert.equal(r.misclassified.length, 0);
    });

    it('one-sided label set -> not separable, threshold null', () => {
        const r = findBestThreshold([pair('ACCEPT', 0.9), pair('ACCEPT', 0.8)]);
        assert.equal(r.separable, false);
        assert.equal(r.threshold, null);
    });

    it('boundary: equal scores across classes cannot separate', () => {
        const r = findBestThreshold([pair('ACCEPT', 0.70), pair('REJECT', 0.70)]);
        assert.equal(r.separable, false);
        assert.equal(r.margin, 0);
        assert.equal(r.correct, 1);
    });

    it('ground-truth set is well formed', () => {
        const seen = new Set<string>();
        for (const p of INDUSTRY_PAIRS as IndustryPair[]) {
            assert.ok(p.a.trim().length > 0 && p.b.trim().length > 0, 'empty label');
            assert.ok(['ACCEPT', 'REJECT', 'UNDECIDED'].includes(p.expect), `bad verdict ${p.expect}`);
            const key = [p.a, p.b].sort().join('||');
            assert.ok(!seen.has(key), `duplicate pair: ${key}`);
            seen.add(key);
        }
        const labelled = INDUSTRY_PAIRS.filter(p => p.expect !== 'UNDECIDED');
        assert.ok(labelled.filter(p => p.expect === 'ACCEPT').length >= 3, 'need ACCEPT examples');
        assert.ok(labelled.filter(p => p.expect === 'REJECT').length >= 3, 'need REJECT examples');
    });
});