import { describe, it, expect } from 'vitest';
import {
  createBlankState,
  updateStateFromExtraction,
  initializeStateFromDocument,
  shouldAskGeographyFirst,
  shouldAskBusinessModelFirst,
} from '../stateManager';
import type { RouterState } from '../types';

function baseState(over: Partial<RouterState> = {}): RouterState {
  return { ...createBlankState(), ...over };
}
function ext(state: Partial<RouterState> = {}, intent: RouterState['intent'] = null, is_complete = false) {
  return { intent, state, is_complete };
}

describe('shouldAskGeographyFirst — geography upfront when missing (B1 ✓)', () => {
  it('first turn, intent known, no geography → TRUE (the old gate wrongly returned false here)', () => {
    // phase deliberately ENTRY — the exact state on the first turn that broke the old gate.
    expect(shouldAskGeographyFirst(baseState({ intent: 'SELL_SIDE', phase: 'ENTRY', round_count: 0 }))).toBe(true);
  });
  it('first turn, only sector known, no geography → TRUE', () => {
    expect(shouldAskGeographyFirst(baseState({ sector: 'manufacturing', round_count: 0 }))).toBe(true);
  });
  it('geography already given → FALSE (never ask again)', () => {
    expect(shouldAskGeographyFirst(baseState({ intent: 'SELL_SIDE', geography: 'Pune', round_count: 0 }))).toBe(false);
  });
  it('later round → FALSE (only the opening round)', () => {
    expect(shouldAskGeographyFirst(baseState({ intent: 'SELL_SIDE', round_count: 1 }))).toBe(false);
  });
  it('nothing known yet → FALSE (still at greeting)', () => {
    expect(shouldAskGeographyFirst(baseState({ round_count: 0 }))).toBe(false);
  });
});

describe('shouldAskBusinessModelFirst — clarify what the business does, even when geography is known (B2 ✓)', () => {
  it('fires when intent + geography known but no industry and sector unset', () => {
    expect(shouldAskBusinessModelFirst(baseState({ intent: 'SELL_SIDE', geography: 'Pune', round_count: 0 }))).toBe(true);
  });
  it('fires when sector is the catch-all "mixed" and no true industry yet', () => {
    expect(shouldAskBusinessModelFirst(baseState({ intent: 'BUY_SIDE', geography: 'India', sector: 'mixed', round_count: 1 }))).toBe(true);
  });
  it('does NOT fire once the true industry is captured', () => {
    expect(shouldAskBusinessModelFirst(baseState({ intent: 'SELL_SIDE', geography: 'Pune', industry: 'Freshwater Aquaculture', round_count: 0 }))).toBe(false);
  });
  it('does NOT fire when a real sector bucket is set (we know roughly what they do)', () => {
    expect(shouldAskBusinessModelFirst(baseState({ intent: 'SELL_SIDE', geography: 'Pune', sector: 'pharma', round_count: 0 }))).toBe(false);
  });
  it('does NOT fire on turn 0 when geography is missing — the geography gate (B1) handles that ask', () => {
    expect(shouldAskBusinessModelFirst(baseState({ intent: 'SELL_SIDE', round_count: 0 }))).toBe(false);
  });
  it('does NOT loop forever — stops after early rounds', () => {
    expect(shouldAskBusinessModelFirst(baseState({ intent: 'SELL_SIDE', geography: 'Pune', round_count: 2 }))).toBe(false);
  });
  it('does NOT fire before intent is known', () => {
    expect(shouldAskBusinessModelFirst(baseState({ geography: 'Pune', round_count: 0 }))).toBe(false);
  });
});

describe('updateStateFromExtraction — trading/distribution sub_sector (B3 ✓)', () => {
  it('manufacturing sector + trading language → sub_sector = trading_distribution', () => {
    const cur = baseState({ sector: 'manufacturing', phase: 'QUALIFICATION', intent: 'SELL_SIDE' });
    const out = updateStateFromExtraction(cur, ext({ sector: 'manufacturing' }, 'SELL_SIDE'), 'we are a supplier of abrasive materials and a distributor');
    expect(out.sub_sector).toBe('trading_distribution');
  });
  it('genuine manufacturer keeps no trading sub_sector', () => {
    const cur = baseState({ sector: 'manufacturing', phase: 'QUALIFICATION', intent: 'SELL_SIDE' });
    const out = updateStateFromExtraction(cur, ext({ sector: 'manufacturing' }, 'SELL_SIDE'), 'we manufacture pumps at our plant');
    expect(out.sub_sector).not.toBe('trading_distribution');
  });
});

describe('free-text industry — primary signal, never forced (hybrid ✓)', () => {
  it('captures the LLM-provided true industry verbatim', () => {
    const cur = baseState({ intent: 'FUNDRAISING' });
    const out = updateStateFromExtraction(
      cur,
      ext({ industry: 'Freshwater Aquaculture (RAS)', sector: 'mixed' }, 'FUNDRAISING'),
      'we run two freshwater aquaculture farms raising capital for RAS technology',
    );
    expect(out.industry).toBe('Freshwater Aquaculture (RAS)');
  });

  it('a document mandate seeds the free-text industry', () => {
    const st = initializeStateFromDocument({
      intent: 'FUNDRAISING',
      industry: 'Freshwater Aquaculture (RAS)',
      geography: 'Western & Central India',
      deal_size: '₹17 Cr',
    });
    expect(st.industry).toBe('Freshwater Aquaculture (RAS)');
    expect(st.intent).toBe('FUNDRAISING');
  });

  it('industry is independent of the coarse sector (no forcing)', () => {
    const cur = baseState({ intent: 'SELL_SIDE', sector: 'manufacturing' });
    const out = updateStateFromExtraction(
      cur,
      ext({ industry: 'specialty steel trading' }, 'SELL_SIDE'),
      'we trade specialty steel',
    );
    expect(out.industry).toBe('specialty steel trading');
  });
});
