import { describe, it, expect } from 'vitest';
import { buildIntentFraming } from '../intentFraming';
import { buildSystemPrompt } from '../promptRouter';
import { baseState } from './_helpers';

describe('buildIntentFraming — deterministic opener per intent + flavor (Piece 4)', () => {
  it('SELL_SIDE → seller opener', () => {
    expect(buildIntentFraming('SELL_SIDE', null).opener).toBe('To position this correctly for relevant buyers, share:');
  });
  it('BUY_SIDE strategic → target opener', () => {
    expect(buildIntentFraming('BUY_SIDE', 'strategic').opener).toBe('To match you with the right target, share:');
  });
  it('BUY_SIDE financial → INVESTOR opener, never "buyer" or "target"', () => {
    const f = buildIntentFraming('BUY_SIDE', 'financial');
    expect(f.opener).toContain('investment mandate');
    expect(f.opener?.toLowerCase()).not.toContain('buyer');
    expect(f.opener?.toLowerCase()).not.toContain('target');
    expect(f.m4Intro?.toLowerCase()).not.toContain('buyer');
  });
  it('FUNDRAISING → investors opener', () => {
    expect(buildIntentFraming('FUNDRAISING', null).opener).toBe('To identify the right investors, share:');
  });
  it('DEBT → lenders opener', () => {
    expect(buildIntentFraming('DEBT', null).opener).toContain('debt providers');
  });
  it('STRATEGIC_PARTNERSHIP → partners opener', () => {
    expect(buildIntentFraming('STRATEGIC_PARTNERSHIP', null).opener).toContain('strategic partners');
  });
  it('null intent → no opener (nothing to leak)', () => {
    expect(buildIntentFraming(null, null).opener).toBeNull();
  });
});

describe('promptRouter — the mandatory opener is injected and matches intent', () => {
  it('SELL_SIDE prompt pins the seller opener', () => {
    const out = buildSystemPrompt(baseState({ intent: 'SELL_SIDE', sector: 'chemicals' }), null);
    expect(out.systemPrompt).toContain('OPENING LINE — MANDATORY');
    expect(out.systemPrompt).toContain('To position this correctly for relevant buyers, share:');
  });
  it('BUY_SIDE financial prompt pins the investor opener (the Chat-5 fix)', () => {
    const out = buildSystemPrompt(baseState({ intent: 'BUY_SIDE', intent_flavor: 'financial', sector: 'consumer' }), null);
    expect(out.systemPrompt).toContain('your investment mandate');
  });
  it('BUY_SIDE prompt never carries the seller opener (the Chat-3 leak)', () => {
    const out = buildSystemPrompt(baseState({ intent: 'BUY_SIDE', intent_flavor: 'strategic', sector: 'logistics' }), null);
    expect(out.systemPrompt).toContain('To match you with the right target, share:');
  });
  it('null intent → neutral, no intent-specific opener', () => {
    const out = buildSystemPrompt(baseState({}), null);
    expect(out.systemPrompt).toContain('use a neutral opener');
  });
});
