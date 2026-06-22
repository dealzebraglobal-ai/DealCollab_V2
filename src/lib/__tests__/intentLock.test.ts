import { describe, it, expect } from 'vitest';
import { baseState, ext } from './_helpers';
import { updateStateFromExtraction } from '../stateManager';

// ─────────────────────────────────────────────────────────────
// Piece 3 — intent set once, then locked. Silent flips ignored; only an
// explicit user pivot (intent_changed=true) changes it. Closes the Chat 3/7 class.
// ─────────────────────────────────────────────────────────────

const e = (o: Record<string, unknown>) => ext(o as never);

describe('intent lock', () => {
  it('first confident commit sets and locks intent', () => {
    const s = updateStateFromExtraction(baseState(), e({ intent: 'BUY_SIDE', intent_confidence: 90 }), 'we want to acquire', []);
    expect(s.intent).toBe('BUY_SIDE');
    expect(s.intent_locked).toBe(true);
  });

  it('THE FIX: once locked, a different intent WITHOUT intent_changed is ignored (no silent flip)', () => {
    const locked = baseState({ intent: 'BUY_SIDE', intent_locked: true });
    const s = updateStateFromExtraction(locked, e({ intent: 'SELL_SIDE', intent_confidence: 88 }), 'we target ₹30-150 Cr revenue businesses', []);
    expect(s.intent).toBe('BUY_SIDE');   // drift ignored
  });

  it('an EXPLICIT pivot (intent_changed=true) is accepted', () => {
    const locked = baseState({ intent: 'BUY_SIDE', intent_locked: true });
    const s = updateStateFromExtraction(locked, e({ intent: 'SELL_SIDE', intent_changed: true, intent_confidence: 95 }), 'actually I want to sell my own company', []);
    expect(s.intent).toBe('SELL_SIDE');
    expect(s.intent_locked).toBe(true);
  });

  it('a low-confidence commit (<50) does NOT lock — stays correctable', () => {
    const s = updateStateFromExtraction(baseState(), e({ intent: 'FUNDRAISING', intent_confidence: 40 }), 'looking for strategic investors', []);
    expect(s.intent).toBe('FUNDRAISING');
    expect(s.intent_locked).toBe(false);
    // next turn can still correct it (still unlocked)
    const s2 = updateStateFromExtraction(s, e({ intent: 'BUY_SIDE', intent_confidence: 85 }), 'we are a fund deploying capital', []);
    expect(s2.intent).toBe('BUY_SIDE');
    expect(s2.intent_locked).toBe(true);
  });

  it('null intent on a later turn never wipes a locked intent', () => {
    const locked = baseState({ intent: 'SELL_SIDE', intent_locked: true });
    const s = updateStateFromExtraction(locked, e({ intent: null }), 'yes, proceed', []);
    expect(s.intent).toBe('SELL_SIDE');
  });

  it('flavor follows the effective intent — kept on BUY_SIDE, nulled otherwise', () => {
    const s = updateStateFromExtraction(baseState(), e({ intent: 'BUY_SIDE', intent_confidence: 90, state: { intent_flavor: 'financial' } }), 'a PE fund', []);
    expect(s.intent_flavor).toBe('financial');
    const locked = baseState({ intent: 'BUY_SIDE', intent_flavor: 'financial', intent_locked: true });
    const s2 = updateStateFromExtraction(locked, e({ intent: 'SELL_SIDE', intent_changed: true, intent_confidence: 95 }), 'actually selling my own firm', []);
    expect(s2.intent_flavor).toBeNull();
  });
});
