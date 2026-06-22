import { describe, it, expect } from 'vitest';
import { resolveCompletion, GENUINE_MANDATE_QUESTION } from '../resolveCompletion';
import { baseState, ext } from './_helpers';

// Part 2 — one deterministic end-flow: a sufficient mandate ALWAYS goes through the single
// genuine-mandate confirmation. Friction and the round-limit can no longer jump to a closure.
describe('Part 2 — friction/round-limit route to confirmation, never a premature closure', () => {
  it('friction on a sufficient mandate → INTENT_VALIDATION + confirmation copy, no insert', () => {
    const stored = baseState({
      intent: 'SELL_SIDE', sector: 'pharma', geography: 'Mumbai', revenue: '₹50 Cr',
      m4_questions_asked: true, is_sufficient: true, phase: 'MOMENTUM',
    });
    const r = resolveCompletion({ storedState: stored, candidateState: stored, message: 'just proceed', extraction: ext({ is_complete: false }) });
    expect(r.state.phase).toBe('INTENT_VALIDATION');         // NOT 'CLOSURE'
    expect(r.shouldInsert).toBe(false);                       // nothing inserts before the YES
    expect(r.messageOverride).toBe(GENUINE_MANDATE_QUESTION); // the confirmation, not a closure line
  });

  it('round-limit (turn 4) on a sufficient mandate → INTENT_VALIDATION, not CLOSURE', () => {
    const stored = baseState({
      intent: 'SELL_SIDE', sector: 'pharma', geography: 'Mumbai', revenue: '₹50 Cr',
      m4_questions_asked: true, is_sufficient: true, phase: 'MOMENTUM', turn_count: 3,
    });
    const r = resolveCompletion({ storedState: stored, candidateState: stored, message: 'We are based in Pune', extraction: ext({ is_complete: false }) });
    expect(r.state.phase).not.toBe('CLOSURE');
    expect(r.state.phase).toBe('INTENT_VALIDATION');
    expect(r.messageOverride).toBe(GENUINE_MANDATE_QUESTION);
  });
});

// Part 3 — the confirmation copy is short, firm, loud (the old one was a soft 4-paragraph block).
describe('Part 3 — confirmation copy', () => {
  it('is loud and tight', () => {
    expect(GENUINE_MANDATE_QUESTION).toContain('goes live');
    expect(GENUINE_MANDATE_QUESTION).toContain('YES');
    expect(GENUINE_MANDATE_QUESTION.length).toBeLessThan(360);
    expect(GENUINE_MANDATE_QUESTION.toLowerCase()).not.toContain('dealcollab operates on trust');
  });
});
