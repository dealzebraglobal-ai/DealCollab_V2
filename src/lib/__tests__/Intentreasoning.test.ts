import { describe, it, expect } from 'vitest';
import { baseState, ext } from './_helpers';
import { updateStateFromExtraction } from '../stateManager';
import { buildSystemPrompt } from '../promptRouter';

// ─────────────────────────────────────────────────────────────
// Piece 1+2 — intent is reasoned by the model, never guessed from keywords;
// the null case is handled structurally instead of leaking a sell-side opener.
// ─────────────────────────────────────────────────────────────

describe('intent_flavor — set by reasoning, only for BUY_SIDE', () => {
  it('captures financial flavor for a PE/VC buyer', () => {
    const s = updateStateFromExtraction(
      baseState(),
      ext({ intent: 'BUY_SIDE', state: { intent_flavor: 'financial' } }),
      'a fund deploying capital into targets', [],
    );
    expect(s.intent).toBe('BUY_SIDE');
    expect(s.intent_flavor).toBe('financial');
  });
  it('captures strategic flavor for an operating-company buyer', () => {
    const s = updateStateFromExtraction(
      baseState(), ext({ intent: 'BUY_SIDE', state: { intent_flavor: 'strategic' } }), 'we want to acquire', [],
    );
    expect(s.intent_flavor).toBe('strategic');
  });
  it('clears flavor when intent is not BUY_SIDE', () => {
    const s = updateStateFromExtraction(
      baseState({ intent_flavor: 'financial' }),
      ext({ intent: 'SELL_SIDE' }), 'I want to sell my company', [],
    );
    expect(s.intent_flavor).toBeNull();
  });
});

describe('NO keyword guessing — intent comes only from the model', () => {
  it('THE FIX: a buyer mandate full of sell-words ("full exit") does NOT become SELL_SIDE on its own', () => {
    // model returns null (couldn't decide) → we must NOT fall back to substring matching
    const s = updateStateFromExtraction(
      baseState(),
      ext({ intent: null }),
      'Seeking businesses where promoters are considering a partial or full exit', [],
    );
    expect(s.intent).toBeNull();   // previously the keyword fallback made this SELL_SIDE
  });
  it('a "pe fund" mandate is not auto-labelled FUNDRAISING by keywords', () => {
    const s = updateStateFromExtraction(
      baseState(), ext({ intent: null }), 'PE fund evaluating profitable consumer brands', [],
    );
    expect(s.intent).toBeNull();
  });
  it('still accepts the intent the model commits', () => {
    const s = updateStateFromExtraction(
      baseState(), ext({ intent: 'BUY_SIDE' }), 'PE fund evaluating profitable consumer brands', [],
    );
    expect(s.intent).toBe('BUY_SIDE');
  });
});

describe('prompt wiring — reasoning block loaded + actionable intent-status line', () => {
  it('the intent-reasoning module is loaded every turn', () => {
    const out = buildSystemPrompt(baseState(), null);
    expect(out.modulesLoaded).toContain('M_intent_reasoning');
  });
  it('null intent → status line forbids an intent-specific opener (closes the leak)', () => {
    const out = buildSystemPrompt(baseState(), null);
    expect(out.systemPrompt).toContain('INTENT_STATUS: NOT YET DETERMINED');
    expect(out.systemPrompt).toContain('Do NOT use any intent-specific opening line');
  });
  it('set intent → status line shows intent + flavor and says keep stable', () => {
    const out = buildSystemPrompt(baseState({ intent: 'BUY_SIDE', intent_flavor: 'financial', sector: 'saas' }), null);
    expect(out.systemPrompt).toContain('INTENT_STATUS: BUY_SIDE (financial) — ESTABLISHED');
  });
});

describe('reasoning block content — the folded-in rules are present', () => {
  it('block carries the new rules: client-objective, capital flow, asset=buy, hierarchy, confidence, stability', async () => {
    const { M_INTENT_REASONING } = await import('../M_intentReasoning');
    expect(M_INTENT_REASONING).toContain("CLIENT'S OBJECTIVE");
    expect(M_INTENT_REASONING).toContain('CAPITAL-FLOW TEST');
    expect(M_INTENT_REASONING).toContain('Acquiring an asset is BUY_SIDE');
    expect(M_INTENT_REASONING).toContain('KEYWORDS — last resort');
    expect(M_INTENT_REASONING).toContain('intent_confidence');
    expect(M_INTENT_REASONING).toContain('PRESERVE it');
  });
  it('M0 contract exposes intent_confidence', async () => {
    const { M0_OUTPUT_SCHEMA } = await import('../M0_outputSchema');
    expect(M0_OUTPUT_SCHEMA).toContain('intent_confidence');
  });
});
