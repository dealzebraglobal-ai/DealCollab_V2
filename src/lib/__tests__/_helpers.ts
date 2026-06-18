import { createBlankState } from '../stateManager';
import type { RouterState, DealIntent } from '../types';
import type { Extraction } from '../resolveCompletion';

/** A full blank RouterState with overrides applied. */
export function baseState(overrides: Partial<RouterState> = {}): RouterState {
  return { ...createBlankState(), ...overrides };
}

/** A minimal LLM extraction object with overrides applied. */
export function ext(overrides: Partial<Extraction> = {}): Extraction {
  return {
    intent: null as DealIntent,
    state: {},
    is_complete: false,
    message: 'ok',
    ...overrides,
  };
}
