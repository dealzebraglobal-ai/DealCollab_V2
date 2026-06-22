import { describe, it, expect } from 'vitest';
import { buildFinalMessage } from '../responseBuilder';

// ─────────────────────────────────────────────────────────────
// A2 — the fallback writer can no longer emit a phase-wrong canned block.
// It must: (1) pass a real message straight through, (2) only produce a
// completion line when the deal is genuinely complete, and (3) NEVER emit
// the old "strategic operators or financial investors?" momentum block.
// ─────────────────────────────────────────────────────────────

describe('buildFinalMessage — safe fallbacks only (A2 ✓)', () => {
  it('A2a. a real message is passed straight through unchanged', () => {
    const msg = 'And what is the approximate annual revenue and transaction structure you are considering?';
    const out = buildFinalMessage({ intent: 'SELL_SIDE', state: { sector: 'pharma' }, message: msg, is_complete: false });
    expect(out).toBe(msg);
  });

  it('A2b. weak message + "sufficient-looking" but NOT complete → no momentum block, no premature closure', () => {
    // This is the dangerous case: sector + size + intent present, AI returns junk, deal NOT complete.
    const out = buildFinalMessage({
      intent: 'SELL_SIDE',
      state: { sector: 'manufacturing', revenue: '₹12 Cr', geography: 'Pune' },
      message: 'ok',            // weak → triggers a fallback
      is_complete: false,
    });
    expect(out).not.toMatch(/strategic operators or financial investors/i); // old momentum block gone
    expect(out).not.toMatch(/structured successfully/i);                    // no premature closure
    expect(out).not.toMatch(/notify you/i);
  });

  it('A2c. weak message + genuinely complete → completion line that mentions Deal Log', () => {
    const out = buildFinalMessage({
      intent: 'SELL_SIDE',
      state: { sector: 'pharma', revenue: '₹50 Cr', geography: 'Mumbai' },
      message: '',
      is_complete: true,
    });
    expect(out).toMatch(/Deal Log/);
    expect(out).not.toMatch(/strategic operators or financial investors/i);
  });

  it('A2d. weak message, mid-qualification → a safe re-prompt (not a phase-wrong block)', () => {
    const out = buildFinalMessage({ intent: 'SELL_SIDE', state: { sector: 'pharma' }, message: '', is_complete: false });
    expect(out).not.toMatch(/strategic operators or financial investors/i);
    expect(out.length).toBeGreaterThan(20);
  });

  it('A2e. nothing known yet → welcome prompt', () => {
    const out = buildFinalMessage({ message: '' });
    expect(out).toMatch(/Welcome to DealCollab/i);
  });
});
