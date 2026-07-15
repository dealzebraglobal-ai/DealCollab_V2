/**
 * Harness for M5_blindCard. Run: npx tsx M5_blindCard.test.ts
 * The decisive test: serialize the pre-EOI view and assert NO identity token appears.
 */
import { buildBlindCounterparty, buildSafeTeaser, type CounterpartyProposalRow } from '../M5_blindCard';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('  FAIL:', m)); };

// A counterparty whose identity-bearing fields are deliberately loaded with detectable tokens.
const cp: CounterpartyProposalRow = {
    id: 'cp-1',
    user_id: 'user-uuid-xyz',
    intent: 'BUY_SIDE',
    sectors: ['FMCG'],
    geographies: ['Mumbai'],
    deal_size_min_cr: 50, deal_size_max_cr: 200,
    revenue_min_cr: 30, revenue_max_cr: 100,
    deal_structure: 'majority stake (60–100%)',
    quality_tier: '1.0',
    raw_text: 'Second-generation promoters of SnackBrandPvtLtd based in Mumbai exploring sale. Call Ramesh 9876543210.',
    normalised_text: 'BUY_SIDE | FMCG | SnackBrandPvtLtd | Mumbai',
    summary_text: 'Imported summary mentioning SnackBrandPvtLtd and ceo@snackbrand.com',
    special_conditions: ['{"ebitda":"18%","promoter":"Ramesh"}'],
    contact_phone: '9876543210',
    advisor_name: 'Ramesh Advisor',
    metadata: { contact_email: 'ceo@snackbrand.com', URL: 'http://snackbrand.com', industry: 'packaged healthy snacks and wellness food' },
};

const IDENTITY_TOKENS = ['SnackBrandPvtLtd', '9876543210', 'Ramesh', 'ceo@snackbrand.com', 'snackbrand.com'];

// ── PRE-EOI: nothing identifying may cross the wire ──
const pre = buildBlindCounterparty(cp, false);
const preJson = JSON.stringify(pre);
for (const tok of IDENTITY_TOKENS) {
    ok(!preJson.includes(tok), `pre-EOI payload must NOT contain identity token "${tok}"`);
}
ok(pre.revealedContact === null, 'pre-EOI: revealedContact is null');
ok(pre.specialConditions.length === 0, 'pre-EOI: specialConditions withheld');
ok(pre.anonymizedPreview === pre.teaser, 'pre-EOI: preview is the safe teaser');
ok(pre.anonymizedPreview.includes('FMCG') && pre.anonymizedPreview.includes('Mumbai'), 'pre-EOI: teaser still carries sector + geo');
ok(pre.anonymizedPreview.includes('₹50–200 Cr'), 'pre-EOI: teaser carries deal-size band');
ok(pre.userId === 'user-uuid-xyz', 'pre-EOI: bare user uuid present (needed for EOI send, not PII)');
// free-text industry IS shown pre-EOI (owner-ruled safe), but NOTHING else from metadata is
ok(pre.industry === 'packaged healthy snacks and wellness food', 'pre-EOI: free-text industry surfaced');
ok(!JSON.stringify(pre).includes('contact_email') && !JSON.stringify(pre).includes('snackbrand.com'),
    'pre-EOI: metadata.contact_email / URL still withheld (only industry extracted)');
// the keys themselves must not exist on the pre-EOI object
for (const k of ['raw_text', 'normalised_text', 'summary_text', 'metadata', 'contact_phone', 'advisor_name']) {
    ok(!(k in (pre as unknown as Record<string, unknown>)), `pre-EOI: key "${k}" absent from payload`);
}

// ── teaser purity: even sparse data never leaks free text ──
const sparse = buildSafeTeaser({ ...cp, deal_structure: null, deal_size_min_cr: null, deal_size_max_cr: null, revenue_min_cr: null, revenue_max_cr: null });
for (const tok of IDENTITY_TOKENS) ok(!sparse.includes(tok), `sparse teaser must not fall back to free text ("${tok}")`);

// ── POST-EOI (connected): contact + full summary now allowed ──
const post = buildBlindCounterparty(cp, true);
ok(post.revealedContact?.phone === '9876543210', 'post-EOI: phone revealed');
ok(post.revealedContact?.advisor === 'Ramesh Advisor', 'post-EOI: advisor revealed');
ok(post.specialConditions.length === 1, 'post-EOI: specialConditions surfaced');
ok(post.anonymizedPreview.includes('SnackBrandPvtLtd'), 'post-EOI: full summary surfaced');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);