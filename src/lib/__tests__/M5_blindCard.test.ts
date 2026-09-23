import { describe, it, expect } from 'vitest';
import { buildBlindCounterparty, buildSafeTeaser, type CounterpartyProposalRow } from '../M5_blindCard';

describe('M5_blindCard', () => {
  const cp: CounterpartyProposalRow = {
    id: 'cp-1',
    user_id: 'user-uuid-xyz',
    intent: 'BUY_SIDE',
    sectors: ['FMCG'],
    geographies: ['Mumbai'],
    deal_size_min_cr: 50,
    deal_size_max_cr: 200,
    revenue_min_cr: 30,
    revenue_max_cr: 100,
    deal_structure: 'majority stake (60–100%)',
    quality_tier: '1.0',
    raw_text: 'Second-generation promoters of SnackBrandPvtLtd based in Mumbai exploring sale. Call Ramesh 9876543210.',
    normalised_text: 'BUY_SIDE | FMCG | SnackBrandPvtLtd | Mumbai',
    summary_text: 'Imported summary mentioning SnackBrandPvtLtd and ceo@snackbrand.com',
    special_conditions: ['{"ebitda":"18%","promoter":"Ramesh"}'],
    contact_phone: '9876543210',
    advisor_name: 'Ramesh Advisor',
    metadata: {
      industry: 'packaged healthy snacks and wellness food',
      sub_type: 'CDMO',
      capacity_utilisation: '78%',
      business_model: 'contract_manufacturing_exposure',
      contact_email: 'ceo@snackbrand.com',
      source_file: 'secret-teaser.pdf',
    },
  };

  const IDENTITY_TOKENS = ['SnackBrandPvtLtd', '9876543210', 'Ramesh', 'ceo@snackbrand.com', 'snackbrand.com'];

  it('pre-EOI view contains no identity tokens and safe teaser', () => {
    const pre = buildBlindCounterparty(cp, false);
    const preJson = JSON.stringify(pre);
    for (const tok of IDENTITY_TOKENS) {
      expect(preJson.includes(tok)).toBe(false);
    }
    expect(pre.revealedContact).toBeNull();
    expect(pre.specialConditions.length).toBe(0);
    // anonymizedPreview is now a paragraph-form Strategic Rationale (Task 6), built from the same
    // safe inputs as `teaser` — deliberately no longer identical to the terse teaser fragment.
    expect(pre.anonymizedPreview).not.toBe(pre.teaser);
    expect(pre.anonymizedPreview.includes('Mumbai')).toBe(true);
    expect(pre.anonymizedPreview.includes('₹50–200 Cr')).toBe(true);
    // 3-6 sentences, paragraph format (Task 9).
    const sentenceCount = pre.anonymizedPreview.split(/(?<=[.!?])\s+/).filter(Boolean).length;
    expect(sentenceCount).toBeGreaterThanOrEqual(2);
    expect(sentenceCount).toBeLessThanOrEqual(6);
    expect(pre.userId).toBe('user-uuid-xyz');
    expect(pre.industry).toBe('packaged healthy snacks and wellness food');
    expect(JSON.stringify(pre).includes('contact_email')).toBe(false);
    expect(JSON.stringify(pre).includes('snackbrand.com')).toBe(false);

    for (const k of ['raw_text', 'normalised_text', 'summary_text', 'metadata', 'contact_phone', 'advisor_name']) {
      expect(k in (pre as unknown as Record<string, unknown>)).toBe(false);
    }
  });

  it('pre-EOI view surfaces allowlisted structured business data, but never raw contact/URL fields from metadata', () => {
    const cpWithBusinessData: CounterpartyProposalRow = {
      ...cp,
          };
    const pre = buildBlindCounterparty(cpWithBusinessData, false);

    const fieldMap = Object.fromEntries(pre.businessData.map(f => [f.key, f.value]));
    expect(fieldMap.sub_type).toBe('CDMO');
    expect(fieldMap.capacity_utilisation).toBe('78%');
    expect(fieldMap.business_model).toBe('contract_manufacturing_exposure');
    expect(pre.businessData.every(f => f.label && f.label.length > 0)).toBe(true);

    const preJson = JSON.stringify(pre);
    expect(preJson.includes('ceo@snackbrand.com')).toBe(false);
    expect(preJson.includes('secret-teaser.pdf')).toBe(false);
  });

  it('sparse teaser never leaks free text', () => {
    const sparse = buildSafeTeaser({ ...cp, deal_structure: null, deal_size_min_cr: null, deal_size_max_cr: null, revenue_min_cr: null, revenue_max_cr: null });
    for (const tok of IDENTITY_TOKENS) {
      expect(sparse.includes(tok)).toBe(false);
    }
  });

  it('post-EOI connected view reveals contact information', () => {
    const post = buildBlindCounterparty(cp, true);
    expect(post.revealedContact?.phone).toBe('9876543210');
    expect(post.revealedContact?.advisor).toBe('Ramesh Advisor');
    expect(post.specialConditions.length).toBe(1);
    expect(post.anonymizedPreview.includes('SnackBrandPvtLtd')).toBe(true);
  });
});