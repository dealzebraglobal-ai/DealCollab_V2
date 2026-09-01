import { describe, it, expect } from 'vitest';
import { classifyWhatsAppCommand } from '../whatsapp/classifyCommand';
import { resolveCompletion } from '../resolveCompletion';
import { baseState, ext } from './_helpers';

/**
 * Regression tests for the premature "final menu" bug (2026-08-25).
 *
 * Root cause: src/lib/whatsapp/chatbot.ts unconditionally sent the
 * "💡 What would you like to do next?" terminal action menu immediately
 * after every match-cards message, with no gate on user intent — and
 * separately, P1/P2/P3 selection was unreachable via WappBiz because its
 * buttons degrade to a numbered plain-text list (no interactive-message
 * endpoint exists), so a bare "2" reply never matched the old
 * `/^view_?p([1-3])/i` regex (which only matches literal button-postback
 * ids like "VIEW_P2"). A third, related bug forced a brand-new blank chat
 * session for ANY message once state.is_complete was true, conflating
 * "mandate complete" with "conversation complete" and discarding context
 * on every post-capture follow-up.
 */
describe('WhatsApp command classification (chatbot.ts)', () => {
  it('TEST 2 / TEST 7 groundwork: a bare "2" selects P2, not the final menu', () => {
    expect(classifyWhatsAppCommand('2')).toEqual({ type: 'VIEW_MATCH', index: 1 });
  });

  it('a literal button postback id ("VIEW_P2") still selects P2 (Meta real buttons)', () => {
    expect(classifyWhatsAppCommand('VIEW_P2')).toEqual({ type: 'VIEW_MATCH', index: 1 });
  });

  it('a sentence that happens to start with a digit is NOT misread as a selection', () => {
    expect(classifyWhatsAppCommand('150 crore budget, 100% acquisition')).toEqual({ type: 'CHAT' });
  });

  it('TEST 3: "Tell me more about P2" is ordinary chat, not the final menu', () => {
    expect(classifyWhatsAppCommand('Tell me more about P2')).toEqual({ type: 'CHAT' });
  });

  it('TEST 4: "Done" triggers the final menu', () => {
    expect(classifyWhatsAppCommand('Done')).toEqual({ type: 'FINISH' });
  });

  it('TEST 5: "That\'s all, finish" triggers the final menu', () => {
    expect(classifyWhatsAppCommand("That's all, finish")).toEqual({ type: 'FINISH' });
  });

  it('TEST 6: "Start over" is the existing reset command, not the final menu', () => {
    expect(classifyWhatsAppCommand('Start over')).toEqual({ type: 'RESET' });
  });

  it('a normal mandate-intake message is plain chat, not finish/reset/selection', () => {
    expect(classifyWhatsAppCommand('I wanna buy a SaaS company')).toEqual({ type: 'CHAT' });
    expect(classifyWhatsAppCommand('Sector is B2B SaaS serving SMEs')).toEqual({ type: 'CHAT' });
  });
});

describe('mandate-complete vs conversation-complete (resolveCompletion is_captured terminal lock)', () => {
  it('TEST 1: confirming ("Yes") activates the mandate — the result is NOT itself the final menu', () => {
    const stored = baseState({
      intent: 'BUY_SIDE', sector: 'saas', geography: 'India', deal_size: '₹150 Cr',
      m4_questions_asked: true, quality_gate_passed: true, quality_score: 7,
      intent_validated: null, phase: 'INTENT_VALIDATION',
    });
    const r = resolveCompletion({
      storedState: stored,
      candidateState: stored,
      message: 'yes',
      extraction: ext({ intent: 'BUY_SIDE', is_complete: false }),
    });
    expect(r.shouldInsert).toBe(true);
    expect(r.state.is_captured).toBe(true);
    expect(r.extraction.message).not.toContain('What would you like to do next');
  });

  it('TEST 7: an ordinary follow-up after capture stays in the SAME conversation (terminal status line), not a reset', () => {
    const captured = baseState({
      intent: 'BUY_SIDE', sector: 'saas', is_captured: true, is_complete: true, phase: 'CLOSURE',
    });
    const r = resolveCompletion({
      storedState: captured,
      candidateState: captured,
      message: 'Can you tell me more about P2?',
      extraction: ext({ intent: 'BUY_SIDE', is_complete: false, message: 'irrelevant — overridden by terminal lock' }),
    });
    expect(r.reason).toBe('already-captured');
    expect(r.shouldInsert).toBe(false);
    // Same conversation continues via the fixed steady-state line — no reset, no re-run of intake.
    expect(r.state.is_captured).toBe(true);
    expect(r.extraction.message).not.toContain('What would you like to do next');
  });
});
