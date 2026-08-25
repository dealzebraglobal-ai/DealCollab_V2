import { describe, it, expect } from 'vitest';
import { classifyWhatsAppCommand } from '../whatsapp/classifyCommand';

/**
 * Regression tests for the "Back to View Proposals" navigation option
 * (2026-08-25). A bare "1"/"2"/"3" reply means something different depending
 * on which screen the WhatsApp conversation is currently showing
 * (chat_sessions.whatsapp_ui_state):
 *
 *   PROPOSAL_LIST:        1/2/3 → View P1/P2/P3
 *   COUNTERPARTY_DETAIL:  1 → Back to proposals, 2 → Open Website, 3 → Start Over
 */
describe('classifyWhatsAppCommand — screen-aware navigation', () => {
  it('TEST 1: on PROPOSAL_LIST, "2" selects P2', () => {
    expect(classifyWhatsAppCommand('2', 'PROPOSAL_LIST')).toEqual({ type: 'VIEW_MATCH', index: 1 });
  });

  it('TEST 2: on COUNTERPARTY_DETAIL, "1" goes back to the proposal list', () => {
    expect(classifyWhatsAppCommand('1', 'COUNTERPARTY_DETAIL')).toEqual({ type: 'BACK_TO_PROPOSALS' });
  });

  it('TEST 3: on COUNTERPARTY_DETAIL, "2" opens the website (unchanged behavior)', () => {
    expect(classifyWhatsAppCommand('2', 'COUNTERPARTY_DETAIL')).toEqual({ type: 'OPEN_WEBSITE' });
  });

  it('TEST 4: on COUNTERPARTY_DETAIL, "3" starts over (unchanged behavior)', () => {
    expect(classifyWhatsAppCommand('3', 'COUNTERPARTY_DETAIL')).toEqual({ type: 'RESET' });
  });

  it('TEST 5 / TEST 6: "1" on COUNTERPARTY_DETAIL always means back, regardless of which P was open', () => {
    // The screen alone (not which index) determines the mapping — P1 and P3 behave identically.
    expect(classifyWhatsAppCommand('1', 'COUNTERPARTY_DETAIL')).toEqual({ type: 'BACK_TO_PROPOSALS' });
  });

  it('TEST 7: after going back (screen reverts to PROPOSAL_LIST), selecting another proposal works', () => {
    // Simulates: P2 detail -> "1" (back) -> screen becomes PROPOSAL_LIST -> "3" selects P3.
    expect(classifyWhatsAppCommand('1', 'COUNTERPARTY_DETAIL')).toEqual({ type: 'BACK_TO_PROPOSALS' });
    expect(classifyWhatsAppCommand('3', 'PROPOSAL_LIST')).toEqual({ type: 'VIEW_MATCH', index: 2 });
  });

  it('with no tracked screen (legacy/unknown), a bare digit defaults to VIEW_MATCH (pre-existing behavior preserved)', () => {
    expect(classifyWhatsAppCommand('2', null)).toEqual({ type: 'VIEW_MATCH', index: 1 });
  });

  it('an explicit "P3" always selects P3 regardless of screen (button postback / direct reference)', () => {
    expect(classifyWhatsAppCommand('VIEW_P3', 'COUNTERPARTY_DETAIL')).toEqual({ type: 'VIEW_MATCH', index: 2 });
    expect(classifyWhatsAppCommand('P3', 'PROPOSAL_LIST')).toEqual({ type: 'VIEW_MATCH', index: 2 });
  });

  it('an explicit BACK_TO_PROPOSALS button postback works regardless of screen tracking', () => {
    expect(classifyWhatsAppCommand('BACK_TO_PROPOSALS', null)).toEqual({ type: 'BACK_TO_PROPOSALS' });
  });

  it('FINISH and RESET word-phrases are unaffected by screen context', () => {
    expect(classifyWhatsAppCommand('Done', 'COUNTERPARTY_DETAIL')).toEqual({ type: 'FINISH' });
    expect(classifyWhatsAppCommand('Start over', 'PROPOSAL_LIST')).toEqual({ type: 'RESET' });
  });
});
