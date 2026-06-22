import { describe, it, expect } from 'vitest';
import { baseState, ext } from './_helpers';
import { updateStateFromExtraction } from '../stateManager';

// Piece 5 — m4_questions_asked is server-set when M4 was loaded, killing the Chat-4 re-ask loop.
describe('m4_questions_asked is server-set', () => {
  it('THE FIX: M4 loaded but model forgot the flag → still marked asked (no re-ask next turn)', () => {
    const s = updateStateFromExtraction(
      baseState({ intent: 'SELL_SIDE', sector: 'pharma', intent_locked: true }),
      ext({ intent: 'SELL_SIDE' }),          // model did NOT set m4_questions_asked
      'we make APIs', ['M3_SELL_SIDE', 'M4_pharma'],
    );
    expect(s.m4_questions_asked).toBe(true);
  });
  it('M4 not loaded + model claims asked → ignored (honesty guard)', () => {
    const s = updateStateFromExtraction(
      baseState({ intent: 'SELL_SIDE', sector: 'pharma' }),
      ext({ intent: 'SELL_SIDE', state: { m4_questions_asked: true } }),
      'we make APIs', ['M3_SELL_SIDE'],      // M4 NOT in modulesLoaded
    );
    expect(s.m4_questions_asked).toBe(false);
  });
});
