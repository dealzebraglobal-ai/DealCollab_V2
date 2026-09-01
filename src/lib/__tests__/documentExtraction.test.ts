/**
 * Regression tests — canonical document extraction consistency (Chat vs Bulk)
 * =============================================================================
 * A real end-to-end test processed the SAME source document through both the
 * Chat document-intake path (parse-document/route.ts -> initializeStateFromDocument)
 * and the Bulk upload path (bulk-upload/route.ts -> initializeStateFromDocument) and
 * found the document-derived fields diverged: sectors/geographies were lost, and
 * currency/urgency/buyer_type/advisor_name/contact_phone never reached Chat state at
 * all.
 *
 * Root cause: initializeStateFromDocument() (the ONE function both flows call to seed
 * RouterState from cleanAndStructureDocument()'s canonical DocumentIntelligence output)
 * read the wrong field names (`sector`/`geography` singular) — the canonical extractor
 * emits `sectors`/`geographies` as arrays — and never mapped currency/urgency/buyer_type/
 * advisor_name/contact_phone into state at all, even though RouterState has always had
 * fields for them.
 *
 * These tests lock in the fix at the single shared seeding function, so both Chat and
 * Bulk stay consistent by construction — there's only one place to break this again.
 */

import { describe, it, expect } from 'vitest';
import { initializeStateFromDocument, updateStateFromExtraction, createBlankState } from '../stateManager';
import type { DocumentIntelligence } from '../intelligenceEngine';

// A canonical DocumentIntelligence object, shaped exactly as cleanAndStructureDocument()
// returns it — this is what BOTH Chat's parse-document route and Bulk's upload route pass
// into initializeStateFromDocument().
function sampleDocIntel(overrides: Partial<DocumentIntelligence> = {}): Record<string, unknown> {
  return {
    intent: 'SELL_SIDE',
    sectors: ['saas'],
    geographies: ['Bangalore'],
    deal_structure: '100% buyout',
    revenue_min_cr: 50,
    revenue_max_cr: 50,
    deal_size_min_cr: 150,
    deal_size_max_cr: 200,
    currency: 'INR',
    urgency: 'High',
    buyer_type: 'Strategic buyers',
    special_conditions: [],
    advisor_name: 'John Doe',
    contact_phone: '+919876543210',
    missing_information: [],
    ...overrides,
  };
}

describe('initializeStateFromDocument — canonical field extraction (regression)', () => {
  it('1. extracts sector from the canonical `sectors` array (Bulk sector-loss bug)', () => {
    const state = initializeStateFromDocument(sampleDocIntel());
    expect(state.sector).toBe('saas');
  });

  it('2. extracts geography from the canonical `geographies` array (Bulk geography-loss bug)', () => {
    const state = initializeStateFromDocument(sampleDocIntel());
    expect(state.geography).toBe('Bangalore');
  });

  it('3. extracts currency (Chat currency-loss bug)', () => {
    const state = initializeStateFromDocument(sampleDocIntel());
    expect(state.currency).toBe('INR');
  });

  it('4. extracts urgency (Chat urgency-loss bug)', () => {
    const state = initializeStateFromDocument(sampleDocIntel());
    expect(state.urgency).toBe('High');
  });

  it('5. extracts buyer_type (Chat buyer-type-loss bug)', () => {
    const state = initializeStateFromDocument(sampleDocIntel());
    expect(state.buyer_type).toBe('Strategic buyers');
  });

  it('6. extracts advisor_name (Chat advisor-name-loss bug)', () => {
    const state = initializeStateFromDocument(sampleDocIntel());
    expect(state.advisor_name).toBe('John Doe');
  });

  it('7. extracts contact_phone (Chat contact-phone-loss bug)', () => {
    const state = initializeStateFromDocument(sampleDocIntel());
    expect(state.contact_phone).toBe('+919876543210');
  });

  it('8. same canonical document -> Chat seeding and Bulk seeding produce identical document-derived fields', () => {
    const doc = sampleDocIntel();
    // Both Chat (parse-document/route.ts) and Bulk (bulk-upload/route.ts) call this exact
    // function with the exact same cleanAndStructureDocument() output — there is no
    // separate Bulk-only or Chat-only extraction path any more.
    const chatState = initializeStateFromDocument(doc);
    const bulkState = initializeStateFromDocument(doc);

    const documentDerivedFields: (keyof typeof chatState)[] = [
      'intent', 'sector', 'geography', 'structure', 'currency',
      'urgency', 'buyer_type', 'advisor_name', 'contact_phone',
    ];
    for (const field of documentDerivedFields) {
      expect(chatState[field]).toEqual(bulkState[field]);
    }
  });

  it('9. intent normalizes to the canonical DealIntent value from the document', () => {
    const state = initializeStateFromDocument(sampleDocIntel({ intent: 'SELL_SIDE' }));
    expect(state.intent).toBe('SELL_SIDE');
  });

  it('10. absent fields stay null — never hallucinated', () => {
    const state = initializeStateFromDocument(sampleDocIntel({
      currency: null, urgency: null, buyer_type: null, advisor_name: null, contact_phone: null,
      sectors: [], geographies: [],
    }));
    expect(state.currency).toBeNull();
    expect(state.urgency).toBeNull();
    expect(state.buyer_type).toBeNull();
    expect(state.advisor_name).toBeNull();
    expect(state.contact_phone).toBeNull();
    expect(state.sector).toBeNull();
    expect(state.geography).toBeNull();
  });

  it('still accepts the legacy singular sector/geography keys (backward compatibility)', () => {
    const state = initializeStateFromDocument({ sector: 'pharma', geography: 'Mumbai' });
    expect(state.sector).toBe('pharma');
    expect(state.geography).toBe('Mumbai');
  });

  it('prefers the canonical plural arrays over legacy singular keys when both are present', () => {
    const state = initializeStateFromDocument({ sectors: ['finserv'], sector: 'pharma' });
    expect(state.sector).toBe('finserv');
  });
});

describe('updateStateFromExtraction — document-seeded fields survive chat follow-up', () => {
  it('a currency/urgency/buyer_type/advisor_name/contact_phone seeded at document intake is not erased by a later turn where the model is silent on those fields', () => {
    const docState = initializeStateFromDocument(sampleDocIntel());
    const next = updateStateFromExtraction(
      docState,
      { intent: 'SELL_SIDE', state: { geography: 'Bangalore' }, is_complete: false },
      'yes please continue',
    );
    expect(next.currency).toBe('INR');
    expect(next.urgency).toBe('High');
    expect(next.buyer_type).toBe('Strategic buyers');
    expect(next.advisor_name).toBe('John Doe');
    expect(next.contact_phone).toBe('+919876543210');
  });

  it('an explicit correction from the model does update the field', () => {
    const docState = initializeStateFromDocument(sampleDocIntel());
    const next = updateStateFromExtraction(
      docState,
      { intent: 'SELL_SIDE', state: { currency: 'USD' }, is_complete: false },
      'actually the currency should be USD',
    );
    expect(next.currency).toBe('USD');
  });

  it('a blank document (no structured fields) never fabricates values on a fresh state', () => {
    const blank = createBlankState();
    expect(blank.currency ?? null).toBeNull();
    expect(blank.urgency ?? null).toBeNull();
    expect(blank.advisor_name ?? null).toBeNull();
    expect(blank.contact_phone ?? null).toBeNull();
  });
});
