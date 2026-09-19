import { describe, it, expect } from 'vitest';
import { buildBlindCounterparty, type CounterpartyProposalRow } from '../M5_blindCard';

describe('Counterparty Identity Card Security Guarantee', () => {
  const mockProposal: CounterpartyProposalRow = {
    id: 'prop-123',
    user_id: 'usr-999',
    intent: 'SELL_SIDE',
    sectors: ['B2B SaaS', 'Healthtech'],
    geographies: ['India'],
    deal_size_min_cr: 20,
    deal_size_max_cr: 250,
    revenue_min_cr: 10,
    revenue_max_cr: 50,
    deal_structure: '100% Acquisition',
    quality_tier: 1,
    // Sensitive fields that MUST NEVER reach the browser before EOI approval
    raw_text: 'Secret proprietary founder details from Acme Technologies',
    normalised_text: 'Acme Technologies B2B SaaS sell-side',
    summary_text: 'Founder Rohan Mehta seeking complete exit for Acme Technologies',
    contact_phone: '+91 98204 41180',
    advisor_name: 'Rohan Mehta',
    metadata: {
      industry: 'Enterprise Software',
      contact_email: 'rohan@acme.com',
      private_note: 'Confidential deal data',
    },
  };

  it('filters out confidential fields when isConnected is false (locked mode)', () => {
    const lockedView = buildBlindCounterparty(mockProposal, false);

    // Identity-bearing fields must NOT exist or must be masked/null
    expect(lockedView.isConnected).toBe(false);
    expect(lockedView.revealedContact).toBeNull();
    expect(lockedView.anonymizedPreview).not.toContain('Rohan Mehta');
    expect(lockedView.anonymizedPreview).not.toContain('Acme Technologies');
    expect(lockedView.teaser).not.toContain('rohan@acme.com');

    // Safe structured attributes are present
    expect(lockedView.intent).toBe('SELL_SIDE');
    expect(lockedView.sectors).toEqual(['B2B SaaS', 'Healthtech']);
    expect(lockedView.geographies).toEqual(['India']);
    expect(lockedView.industry).toBe('Enterprise Software');
  });

  it('reveals contact and full summary ONLY when isConnected is true (approved EOI)', () => {
    const connectedView = buildBlindCounterparty(mockProposal, true);

    expect(connectedView.isConnected).toBe(true);
    expect(connectedView.revealedContact).toEqual({
      phone: '+91 98204 41180',
      advisor: 'Rohan Mehta',
    });
    expect(connectedView.anonymizedPreview).toBe(
      'Founder Rohan Mehta seeking complete exit for Acme Technologies'
    );
  });
});
