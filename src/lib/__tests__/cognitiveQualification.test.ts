import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../promptRouter';
import { baseState } from './_helpers';

describe('Part 1 — cognitive qualification brain: wiring', () => {
  it('loads in the standard qualification flow', () => {
    const out = buildSystemPrompt(baseState({ intent: 'SELL_SIDE', sector: 'pharma', geography: 'Mumbai', phase: 'QUALIFICATION' }), null);
    expect(out.modulesLoaded).toContain('M_cognitive_qualification');
  });

  it('does NOT load in document-intake mode (it has its own script)', () => {
    const out = buildSystemPrompt(baseState({ is_document_intake: true, is_complete: false, intent: 'BUY_SIDE', sector: 'saas', phase: 'QUALIFICATION' }), null);
    expect(out.modulesLoaded).not.toContain('M_cognitive_qualification');
  });

  it('does NOT load in profile-search mode', () => {
    const out = buildSystemPrompt(baseState({ is_profile_search: true }), null);
    expect(out.modulesLoaded).not.toContain('M_cognitive_qualification');
  });

  it('does NOT load in intent-validation mode', () => {
    const out = buildSystemPrompt(baseState({ phase: 'INTENT_VALIDATION', quality_gate_passed: true }), null);
    expect(out.modulesLoaded).not.toContain('M_cognitive_qualification');
  });
});

describe('Part 1 — cognitive qualification brain: key rules survive in the prompt', () => {
  const p = () => buildSystemPrompt(baseState({ intent: 'BUY_SIDE', sector: 'saas', geography: 'Pune', phase: 'QUALIFICATION' }), null).systemPrompt;

  it('overrides the rigid recital framing', () => { expect(p()).toContain('OVERRIDES'); });
  it('states the floor + the model-picked 1-2 sector details', () => { expect(p()).toMatch(/1.2 sector-specific/); });
  it('pins the SaaS-vs-agency read (Chat 4)', () => { expect(p()).toContain('ARR / MRR'); });
  it('pins the EV-charging read', () => { expect(p()).toContain('EV CHARGING'); });
  it('carries the off-enum / mixed reasoning branch', () => { expect(p().toLowerCase()).toContain('unrecognised'); });
  it('carries the financial-sponsor rationale rule', () => { expect(p()).toContain('financial investor'); });
  it('tells the model to stop asking when the floor is met', () => { expect(p().toLowerCase()).toContain('stop asking'); });
});
