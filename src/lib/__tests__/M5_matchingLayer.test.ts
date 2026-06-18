import { describe, it, expect } from 'vitest';
import { buildM5_Matching } from '../M5_matchingLayer';

// ─────────────────────────────────────────────────────────────
// Round 3 (fake match %) — prompt-contract regression.
//
// We cannot unit-test what the live LLM writes, but buildM5_Matching is a
// pure function, so we CAN pin the instruction it gives the model. The bug
// was that the prompt demanded a "[Compatibility]" value (a %) for
// counterparties that were never scored, forcing the model to invent one.
// These tests lock the fixed contract so that fabrication instruction can't
// quietly come back.
// ─────────────────────────────────────────────────────────────

const SAMPLE = `- [BUY_SIDE] pharma | Size: 40-80 Cr | Geography: Mumbai
- [BUY_SIDE] pharma | Size: 100-200 Cr | Geography: Pune`;

describe('buildM5_Matching — preview must not instruct fabricated percentages (Round 3 ✓)', () => {
  it('non-empty branch: no compatibility-% instruction survives', () => {
    const out = buildM5_Matching(SAMPLE);
    expect(out).not.toContain('[Compatibility]');
    expect(out).not.toMatch(/%/);            // no percentage anywhere
    expect(out).not.toMatch(/below\s*40/i);  // the old "Never present below 40%" rule is gone
  });

  it('non-empty branch: explicitly forbids inventing a score and frames as indicative', () => {
    const out = buildM5_Matching(SAMPLE);
    expect(out.toLowerCase()).toContain('never');
    expect(out.toLowerCase()).toMatch(/invent|imply/);          // forbids inventing/implying a score
    expect(out.toLowerCase()).toContain('indicative');          // reframed as indicative, not confirmed
    expect(out.toLowerCase()).toMatch(/not confirmed matches|not\s+confirmed/i);
  });

  it('non-empty branch: defers real scoring to submission + dashboard, and includes the candidates', () => {
    const out = buildM5_Matching(SAMPLE);
    expect(out.toLowerCase()).toMatch(/submit/);          // precise scoring on submission
    expect(out.toLowerCase()).toContain('deal dashboard'); // real matches surfaced on dashboard
    expect(out).toContain(SAMPLE);                         // still shows the active counterparties
  });

  it('empty / null branch: unchanged "matchmaking running" message, still no percentage', () => {
    for (const empty of [null, '', '   ']) {
      const out = buildM5_Matching(empty as string | null);
      expect(out).toMatch(/matchmaking engine is now active/i);
      expect(out).toMatch(/90 days/);
      expect(out).not.toMatch(/%/);
    }
  });
});
