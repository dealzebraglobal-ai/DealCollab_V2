import { describe, it, expect } from 'vitest';
import { resolveCompletion } from '../resolveCompletion';
import { baseState, ext } from './_helpers';

/**
 * Regression test for the WhatsApp re-ask loop (2026-08-25).
 *
 * Root cause: chatPipeline.ts (the WhatsApp-facing pipeline) called
 * resolveCompletion() with a hardcoded modulesLoaded: [] instead of the real
 * module list buildSystemPrompt() returned for that turn. m4_questions_asked
 * is a server-set flag (stateManager.ts) that only becomes true when an
 * M4_* module was actually in the prompt — with modulesLoaded always empty,
 * it could never become true, so the M4 guard in resolveCompletion fired on
 * every single turn once a sector was set and the LLM believed the mandate
 * was complete, permanently overriding the model's real message with the
 * same "Before I finalise this mandate..." bridge text regardless of what
 * the user answered.
 */
describe('WhatsApp M4 re-ask loop (chatPipeline modulesLoaded plumbing)', () => {
  it('BUG REPRODUCTION: modulesLoaded always [] → M4 guard fires every turn, same bridge text forever', () => {
    let stored = baseState({ intent: 'BUY_SIDE', sector: 'saas', phase: 'MOMENTUM' });

    // Turn 1: user says "Proceed" — LLM (correctly) thinks the mandate is ready to close.
    const turn1 = resolveCompletion({
      storedState: stored,
      candidateState: stored,
      message: 'Proceed',
      extraction: ext({ intent: 'BUY_SIDE', is_complete: true, message: 'Mandate captured.' }),
      modulesLoaded: [], // the bug: chatPipeline.ts hardcoded this
    });
    expect(turn1.m4GuardFired).toBe(true);
    expect(turn1.state.m4_questions_asked).toBe(false); // never gets set — the bug
    expect(turn1.extraction.message).toContain('Before I finalise this mandate');

    stored = turn1.state;

    // Turn 2: user answers with detailed sector information. Because
    // m4_questions_asked is still false, the guard fires again and stomps
    // the LLM's real (presumably useful) response with the exact same text.
    const turn2 = resolveCompletion({
      storedState: stored,
      candidateState: stored,
      message: 'Sector is B2B SaaS, retention ~90-95%, SME and mid-market customers.',
      extraction: ext({ intent: 'BUY_SIDE', is_complete: true, message: 'Great, noted the sector details — what is your budget?' }),
      modulesLoaded: [], // still dropped — this is the infinite loop
    });
    expect(turn2.m4GuardFired).toBe(true);
    expect(turn2.extraction.message).toBe(turn1.extraction.message); // same text again — the observed bug
  });

  it('FIX: real modulesLoaded threaded through → M4 asked once, then the guard does not re-fire', () => {
    let stored = baseState({ intent: 'BUY_SIDE', sector: 'saas', phase: 'MOMENTUM' });

    // Turn 1: LLM thinks it's done; M4_saas was genuinely in the prompt this turn
    // (buildSystemPrompt's real modulesLoaded, now correctly passed through).
    const turn1 = resolveCompletion({
      storedState: stored,
      candidateState: stored,
      message: 'Proceed',
      extraction: ext({
        intent: 'BUY_SIDE',
        is_complete: true,
        message: 'Before I finalise this mandate, I need a few sector-specific details about the saas target...',
      }),
      modulesLoaded: ['M3_BUY_SIDE', 'M4_saas'],
    });
    expect(turn1.m4GuardFired).toBe(true);
    expect(turn1.state.m4_questions_asked).toBe(true); // server-set because M4_saas was loaded

    stored = turn1.state;

    // Turn 2: user answers the sector questions. M4 is no longer loaded (already asked),
    // and the guard must NOT re-fire — the model's real follow-up question must reach the user.
    const turn2 = resolveCompletion({
      storedState: stored,
      candidateState: stored,
      message: 'Sector is B2B SaaS, retention ~90-95%, SME and mid-market customers.',
      extraction: ext({
        intent: 'BUY_SIDE',
        is_complete: false,
        message: 'Great, noted the sector details — what is your budget?',
      }),
      modulesLoaded: ['M3_BUY_SIDE'],
    });
    expect(turn2.m4GuardFired).toBe(false);
    expect(turn2.extraction.message).toBe('Great, noted the sector details — what is your budget?');
    expect(turn2.extraction.message).not.toContain('Before I finalise this mandate');
  });
});
