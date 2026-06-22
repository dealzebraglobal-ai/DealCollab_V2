import { describe, it, expect } from 'vitest';
import { resolveCompletion } from '../resolveCompletion';
import { baseState, ext } from './_helpers';

// Convenience: candidateState defaults to the storedState (no pre-detection effect)
// unless a test needs pre-detected values.
function run(args: Parameters<typeof resolveCompletion>[0]) {
  return resolveCompletion(args);
}

describe('resolveCompletion — quality gate funnel (correct behavior)', () => {
  it('A. full SELL_SIDE, M4 asked, LLM completes → quality PASS → INTENT_VALIDATION (no insert yet)', () => {
    const stored = baseState({
      intent: 'SELL_SIDE', sector: 'pharma', geography: 'Mumbai', revenue: '₹50 Cr',
      m4_questions_asked: true, is_sufficient: true, phase: 'MOMENTUM',
    });
    const r = run({ storedState: stored, candidateState: stored, message: "that's everything", extraction: ext({ is_complete: true }) });
    expect(r.shouldInsert).toBe(false);
    expect(r.state.quality_gate_passed).toBe(true);
    expect(r.state.is_complete).toBe(false);
    expect(r.state.phase).toBe('INTENT_VALIDATION');
    expect(r.state.intent_validated).toBeNull();
    expect(r.reason).toBe('quality-gate-pass-await-validation');
  });

  it('B. SELL_SIDE missing geography → quality FAIL (first) → extend, no insert', () => {
    const stored = baseState({
      intent: 'SELL_SIDE', sector: 'pharma', m4_questions_asked: true, phase: 'MOMENTUM',
    });
    const r = run({ storedState: stored, candidateState: stored, message: 'done', extraction: ext({ is_complete: true }) });
    expect(r.shouldInsert).toBe(false);
    expect(r.state.is_complete).toBe(false);
    expect(r.state.quality_gate_attempted).toBe(true);
    expect(r.state.quality_gate_passed).toBe(false);
    expect(r.state.round_count).toBe(0);
    expect(r.reason).toBe('quality-gate-extend');
  });

  it('N. BUY_SIDE full set → quality PASS → INTENT_VALIDATION', () => {
    const stored = baseState({
      intent: 'BUY_SIDE', sector: 'saas', geography: 'India', deal_size: '₹100 Cr',
      m4_questions_asked: true, phase: 'MOMENTUM',
    });
    const r = run({ storedState: stored, candidateState: stored, message: 'ready', extraction: ext({ is_complete: true }) });
    expect(r.state.quality_gate_passed).toBe(true);
    expect(r.state.phase).toBe('INTENT_VALIDATION');
    expect(r.reason).toBe('quality-gate-pass-await-validation');
  });
});

describe('resolveCompletion — intent validation', () => {
  const validatedStored = () => baseState({
    intent: 'SELL_SIDE', sector: 'pharma', geography: 'Mumbai', revenue: '₹50 Cr',
    m4_questions_asked: true, quality_gate_passed: true, quality_score: 7,
    intent_validated: null, phase: 'INTENT_VALIDATION',
  });

  it('C. "yes" → validated, inserts', () => {
    const stored = validatedStored();
    const r = run({ storedState: stored, candidateState: stored, message: 'yes', extraction: ext({ is_complete: false }) });
    expect(r.state.intent_validated).toBe(true);
    expect(r.state.is_complete).toBe(true);
    expect(r.shouldInsert).toBe(true);
    expect(r.reason).toBe('intent-validated-yes');
  });

  it('E. "no, just exploring" → declined, no insert', () => {
    const stored = validatedStored();
    const r = run({ storedState: stored, candidateState: stored, message: 'no, just exploring', extraction: ext({ is_complete: false }) });
    expect(r.state.intent_validated).toBe(false);
    expect(r.shouldInsert).toBe(false);
    expect(r.reason).toBe('intent-validated-no');
  });

  it('D. FIXED (Phase 2.5): "absolutely not" is read as NO — declined, no insert', () => {
    const stored = validatedStored();
    const r = run({ storedState: stored, candidateState: stored, message: 'absolutely not', extraction: ext({ is_complete: false }) });
    expect(r.state.intent_validated).toBe(false);
    expect(r.shouldInsert).toBe(false);
    expect(r.reason).toBe('intent-validated-no');
  });

  it('M. FIXED (Phase 2.5): "sure" is a real Yes — inserts with intent_validated=true (no more null insert)', () => {
    const stored = validatedStored();
    const r = run({ storedState: stored, candidateState: stored, message: 'sure', extraction: ext({ is_complete: true }) });
    expect(r.state.intent_validated).toBe(true);
    expect(r.shouldInsert).toBe(true);
    expect(r.reason).toBe('intent-validated-yes');
  });

  it('AI-field primary: intent_validation="yes" confirms even when the text is ambiguous', () => {
    const stored = validatedStored();
    const r = run({ storedState: stored, candidateState: stored, message: 'ok', extraction: ext({ is_complete: false, intent_validation: 'yes' }) });
    expect(r.state.intent_validated).toBe(true);
    expect(r.shouldInsert).toBe(true);
  });

  it('AI-field primary: intent_validation="no" declines on ambiguous text', () => {
    const stored = validatedStored();
    const r = run({ storedState: stored, candidateState: stored, message: 'ok', extraction: ext({ is_complete: false, intent_validation: 'no' }) });
    expect(r.state.intent_validated).toBe(false);
    expect(r.shouldInsert).toBe(false);
  });

  it('negation backstop overrides the AI: AI says yes but user clearly says "no thanks" → declined', () => {
    const stored = validatedStored();
    const r = run({ storedState: stored, candidateState: stored, message: 'no thanks', extraction: ext({ is_complete: false, intent_validation: 'yes' }) });
    expect(r.state.intent_validated).toBe(false);
    expect(r.shouldInsert).toBe(false);
  });
});

describe('resolveCompletion — M4 guard', () => {
  it('F. LLM completes before M4 asked → guard blocks, rewrites message to the sector bridge', () => {
    const stored = baseState({
      intent: 'SELL_SIDE', sector: 'pharma', geography: 'Mumbai',
      m4_questions_asked: false, phase: 'QUALIFICATION',
    });
    const r = run({ storedState: stored, candidateState: stored, message: 'looks complete to me', extraction: ext({ is_complete: true }) });
    expect(r.m4GuardFired).toBe(true);
    expect(r.state.is_complete).toBe(false);
    expect(r.state.phase).toBe('QUALIFICATION');
    expect(r.messageOverride).toMatch(/sector-specific details about the pharma target/);
    expect(r.reason).toBe('blocked-by-m4-guard');
  });

  it('G. friction bypasses the M4 guard → jumps straight to quality gate / validation, M4 skipped', () => {
    const stored = baseState({
      intent: 'SELL_SIDE', sector: 'pharma', geography: 'Mumbai', revenue: '₹50 Cr',
      m4_questions_asked: false, phase: 'QUALIFICATION',
    });
    const r = run({ storedState: stored, candidateState: stored, message: 'go ahead', extraction: ext({ is_complete: false }) });
    expect(r.m4GuardFired).toBe(false);            // friction skipped enrichment entirely
    expect(r.state.quality_gate_passed).toBe(true);
    expect(r.state.phase).toBe('INTENT_VALIDATION');
    expect(r.reason).toBe('quality-gate-pass-await-validation');
  });
});

describe('resolveCompletion — document fast-lane (Phase 3.2/3.3/3.4 ✓)', () => {
  const docStored = () => baseState({
    is_document_intake: true,
    intent: 'SELL_SIDE', sector: 'pharma', geography: 'Mumbai', revenue: '₹50 Cr',
    m4_questions_asked: false, phase: 'QUALIFICATION', turn_count: 1,
  });

  it('H. FIXED (Phase 3.2/3.4): confirming a document with "yes" completes it and goes straight to matching (skips M4 AND the separate genuine-mandate Y/N)', () => {
    const stored = docStored();
    const r = run({ storedState: stored, candidateState: stored, message: 'yes', extraction: ext({ is_complete: false }) });
    expect(r.m4GuardFired).toBe(false);            // fast-lane: M4 skipped
    expect(r.state.quality_gate_passed).toBe(true);
    expect(r.state.intent_validated).toBe(true);   // the document confirmation IS the genuine signal
    expect(r.shouldInsert).toBe(true);             // → matching
  });

  it('I. FIXED (Phase 3.4): "go ahead" behaves the SAME as "yes" — a confirmed document goes straight to matching', () => {
    const stored = docStored();
    const r = run({ storedState: stored, candidateState: stored, message: 'go ahead', extraction: ext({ is_complete: false }) });
    expect(r.state.intent_validated).toBe(true);
    expect(r.shouldInsert).toBe(true);
  });

  it('correction: "no, the revenue is wrong" stays in synthesis, nothing saved', () => {
    const stored = docStored();
    const r = run({ storedState: stored, candidateState: stored, message: 'no, the revenue is wrong', extraction: ext({ is_complete: false }) });
    expect(r.shouldInsert).toBe(false);
    expect(r.state.is_complete).toBe(false);
    expect(r.state.is_document_intake).toBe(true);
  });
});

describe('resolveCompletion — friction & RC8 are still gated by the quality gate', () => {
  it('J. RC8 4-turn auto-close with thin BUY_SIDE → quality FAIL → extend, no insert', () => {
    const stored = baseState({
      intent: 'BUY_SIDE', sector: 'saas', m4_questions_asked: true,
      turn_count: 3, phase: 'QUALIFICATION',
    });
    const r = run({ storedState: stored, candidateState: stored, message: 'what else do you need', extraction: ext({ is_complete: false }) });
    expect(r.shouldInsert).toBe(false);
    expect(r.state.quality_gate_attempted).toBe(true);
    expect(r.reason).toBe('quality-gate-extend');
  });

  it('K. friction with only intent+sector → quality FAIL → extend, no insert', () => {
    const stored = baseState({
      intent: 'SELL_SIDE', sector: 'pharma', m4_questions_asked: true, phase: 'QUALIFICATION',
    });
    const r = run({ storedState: stored, candidateState: stored, message: 'this is enough', extraction: ext({ is_complete: false }) });
    expect(r.shouldInsert).toBe(false);
    expect(r.state.is_complete).toBe(false);
    expect(r.reason).toBe('quality-gate-extend');
  });
});

describe('resolveCompletion — in-progress turn', () => {
  it('L. nothing complete → not finalized, no insert, no guard', () => {
    const stored = baseState({
      intent: 'SELL_SIDE', sector: 'pharma', m4_questions_asked: false, phase: 'QUALIFICATION',
    });
    const r = run({ storedState: stored, candidateState: stored, message: "it's based in Mumbai", extraction: ext({ is_complete: false }) });
    expect(r.shouldInsert).toBe(false);
    expect(r.m4GuardFired).toBe(false);
    expect(r.reason).toBe('not-finalized');
  });
});

// ─────────────────────────────────────────────────────────────
// Step 1 — terminal lock + genuine-mandate gate can't get stuck
// ─────────────────────────────────────────────────────────────

import { TERMINAL_STATUS_LINE } from '../resolveCompletion';

describe('resolveCompletion — terminal lock (Step 1 ✓)', () => {
  const captured = () => baseState({
    intent: 'SELL_SIDE', sector: 'pharma', geography: 'Mumbai', revenue: '₹50 Cr',
    m4_questions_asked: true, quality_gate_passed: true, intent_validated: true,
    is_complete: true, is_captured: true, phase: 'CLOSURE', turn_count: 6,
  });

  it('S1. after capture, ANY further message returns the SAME fixed status line, no insert', () => {
    for (const msg of ['ok', 'thanks', 'any update?', 'go ahead', 'find matches now']) {
      const stored = captured();
      const r = run({ storedState: stored, candidateState: stored, message: msg, extraction: ext({ message: 'something the AI made up' }) });
      expect(r.shouldInsert).toBe(false);                 // never re-insert
      expect(r.reason).toBe('already-captured');
      expect(r.extraction.message).toBe(TERMINAL_STATUS_LINE); // one fixed line, every time
      expect(r.state.is_complete).toBe(true);
      expect(r.state.phase).toBe('CLOSURE');
    }
  });

  it('S2. the capture turn itself inserts ONCE and stamps is_captured for next turn', () => {
    // quality already passed + user confirms genuine mandate ("yes") → completes now.
    const stored = baseState({
      intent: 'SELL_SIDE', sector: 'pharma', geography: 'Mumbai', revenue: '₹50 Cr',
      m4_questions_asked: true, quality_gate_passed: true, intent_validated: null,
      phase: 'INTENT_VALIDATION', turn_count: 4, is_captured: false,
    });
    const r = run({ storedState: stored, candidateState: stored, message: 'yes', extraction: ext({ is_complete: false, intent_validation: 'yes' }) });
    expect(r.state.intent_validated).toBe(true);
    expect(r.shouldInsert).toBe(true);          // inserts on THIS turn
    expect(r.state.is_captured).toBe(true);      // stamped → next turn is terminal
    expect(r.reason).toBe('intent-validated-yes');
  });
});

describe('resolveCompletion — genuine-mandate gate cannot be skipped or stuck (Step 1 ✓)', () => {
  it('S3. quality passed but phase wrongly stuck at CLOSURE with no Yes/No yet → un-sticks to INTENT_VALIDATION, no insert', () => {
    // Reproduces "Phase regression blocked: CLOSURE → INTENT_VALIDATION": a prior turn left
    // phase=CLOSURE while the genuine-mandate answer was still pending. A neutral message must
    // re-present the gate, not silently stay closed and skip confirmation.
    const stored = baseState({
      intent: 'SELL_SIDE', sector: 'pharma', geography: 'Mumbai', revenue: '₹50 Cr',
      m4_questions_asked: true, quality_gate_passed: true, intent_validated: null,
      phase: 'CLOSURE', turn_count: 4,
    });
    const r = run({ storedState: stored, candidateState: stored, message: 'what does that mean?', extraction: ext({ is_complete: false }) });
    expect(r.state.intent_validated).toBeNull();    // not answered yet
    expect(r.state.is_complete).toBe(false);         // cannot complete without a real yes
    expect(r.state.phase).toBe('INTENT_VALIDATION');  // un-stuck from CLOSURE
    expect(r.shouldInsert).toBe(false);
  });

  it('S4. quality passed + explicit "no" → declines, no insert, not captured', () => {
    const stored = baseState({
      intent: 'SELL_SIDE', sector: 'pharma', geography: 'Mumbai', revenue: '₹50 Cr',
      m4_questions_asked: true, quality_gate_passed: true, intent_validated: null,
      phase: 'INTENT_VALIDATION', turn_count: 4,
    });
    const r = run({ storedState: stored, candidateState: stored, message: 'no, just exploring', extraction: ext({ intent_validation: 'no' }) });
    expect(r.state.intent_validated).toBe(false);
    expect(r.shouldInsert).toBe(false);
    expect(r.state.is_captured).toBeFalsy();
  });
});

// ─────────────────────────────────────────────────────────────
// A1 — engine owns the message for every decided stage
// ─────────────────────────────────────────────────────────────

import {
  GENUINE_MANDATE_QUESTION,
  INTENT_DECLINED_MESSAGE,
  CAPTURE_CONFIRMATION,
} from '../resolveCompletion';

describe('resolveCompletion — one voice: correct message per stage (A1 ✓)', () => {
  const full = (over = {}) => baseState({
    intent: 'SELL_SIDE', sector: 'pharma', geography: 'Mumbai', revenue: '₹50 Cr',
    m4_questions_asked: true, ...over,
  });

  it('A1a. plain qualification turn (asking questions) → NO override, AI message is kept', () => {
    const stored = baseState({ intent: 'SELL_SIDE', sector: 'pharma', phase: 'QUALIFICATION' });
    const r = run({ storedState: stored, candidateState: stored, message: 'it is a formulations business', extraction: ext({ is_complete: false, message: 'And what is the approximate annual revenue and transaction structure?' }) });
    expect(r.messageOverride).toBeNull();
    expect(r.extraction.message).toContain('revenue'); // AI question preserved
  });

  it('A1b. quality gate fails (no geography) → override asks ONLY for the missing field', () => {
    const stored = baseState({ intent: 'SELL_SIDE', sector: 'pharma', m4_questions_asked: true, phase: 'MOMENTUM' });
    const r = run({ storedState: stored, candidateState: stored, message: 'done', extraction: ext({ is_complete: true }) });
    expect(r.messageOverride).toMatch(/city, state, or region/i);
    expect(r.messageOverride).toMatch(/we need/i);
    expect(r.extraction.message).toBe(r.messageOverride); // flows through buildFinalMessage
  });

  it('A1c. quality passed, awaiting Yes/No → override is the genuine-mandate question (never a closure)', () => {
    const stored = full({ quality_gate_passed: true, intent_validated: null, phase: 'INTENT_VALIDATION', turn_count: 4 });
    const r = run({ storedState: stored, candidateState: stored, message: 'what does that mean?', extraction: ext({ is_complete: false }) });
    expect(r.messageOverride).toBe(GENUINE_MANDATE_QUESTION);
    expect(r.messageOverride).not.toMatch(/structured successfully/i);
  });

  it('A1d. user confirms ("yes") → deal captured → override is the capture confirmation (mentions Deal Log)', () => {
    const stored = full({ quality_gate_passed: true, intent_validated: null, phase: 'INTENT_VALIDATION', turn_count: 4 });
    const r = run({ storedState: stored, candidateState: stored, message: 'yes', extraction: ext({ intent_validation: 'yes' }) });
    expect(r.shouldInsert).toBe(true);
    expect(r.messageOverride).toBe(CAPTURE_CONFIRMATION);
    expect(r.messageOverride).toMatch(/Deal Log/);
  });

  it('A1e. user declines ("no") → override is the soft-decline message, no insert', () => {
    const stored = full({ quality_gate_passed: true, intent_validated: null, phase: 'INTENT_VALIDATION', turn_count: 4 });
    const r = run({ storedState: stored, candidateState: stored, message: 'no, just exploring', extraction: ext({ intent_validation: 'no' }) });
    expect(r.shouldInsert).toBe(false);
    expect(r.messageOverride).toBe(INTENT_DECLINED_MESSAGE);
  });

  it('A1f. "structured successfully / we will notify you" NEVER appears before genuine capture', () => {
    // The exact CHAT-2 bug: sufficient-looking but missing geography → must NOT show the closure speech.
    const stored = baseState({ intent: 'SELL_SIDE', sector: 'manufacturing', revenue: '₹12 Cr', structure: 'Majority', m4_questions_asked: true, phase: 'MOMENTUM' });
    const r = run({ storedState: stored, candidateState: stored, message: 'ok', extraction: ext({ is_complete: true }) });
    expect(r.shouldInsert).toBe(false);                          // not actually complete (no geography)
    expect(r.extraction.message || '').not.toMatch(/structured successfully/i);
    expect(r.extraction.message || '').not.toMatch(/notify you/i);
  });
});
