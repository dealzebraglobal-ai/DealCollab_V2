/**
 * Harness for M5_synergy. Run: npx tsx M5_synergy.test.ts
 * Asserts the comment is derived from real inputs, band-only (no raw score), and identity-safe.
 */
import { buildSynergyReview, type SynergySide } from '../M5_synergy';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('  FAIL:', m)); };

const src: SynergySide = {
    intent: 'BUY_SIDE', sector: 'manufacturing', industry: 'industrial engineering and precision components',
    geography: 'Pune', dealMin: 100, dealMax: 250, revMin: null, revMax: null,
};
const cp: SynergySide = {
    intent: 'SELL_SIDE', sector: 'manufacturing', industry: 'industrial engineering and precision components',
    geography: 'Mumbai', dealMin: 100, dealMax: 200, revMin: null, revMax: null,
};

// ── same-sector, overlapping size, same state, same industry ──
const r = buildSynergyReview(src, cp, 76);
ok(r.alignmentBand === 'High', 'score 76 -> High band');
ok(/same-sector|consolidation/i.test(r.sectorFit), 'sector fit reflects same-sector consolidation (from matrix)');
ok(/overlap/i.test(r.financialFit), 'financial fit detects band overlap (100-250 vs 100-200)');
ok(/same region/i.test(r.geographyFit), 'geography fit: Pune & Mumbai -> same region (Maharashtra)');
ok(r.industryNote !== null && /Both operate in/i.test(r.industryNote), 'industry note: both same free-text industry');
ok(!/\b\d{2,3}%|\b76\b/.test(r.comment), 'comment is band-only, no raw score number');

// ── disjoint sizes, different regions ──
const r2 = buildSynergyReview(
    { ...src, dealMin: 10, dealMax: 20, geography: 'Delhi' },
    { ...cp, dealMin: 100, dealMax: 200, geography: 'Chennai' },
    58,
);
ok(r2.alignmentBand === 'Exploratory', 'score 58 -> Exploratory');
ok(/differ/i.test(r2.financialFit), 'disjoint bands -> "differ"');
ok(/different regions/i.test(r2.geographyFit), 'Delhi vs Chennai -> different regions');

// ── identity safety: even with a phone/email lurking in an industry string, none leaks ──
const r3 = buildSynergyReview(src, { ...cp, industry: 'auto-components' }, 65);
ok(r3.alignmentBand === 'Moderate', 'score 65 -> Moderate');
ok(!/@|\b\d{10}\b/.test(r3.comment + r3.sectorFit + r3.financialFit + (r3.industryNote ?? '')), 'no email/phone tokens anywhere');
ok(r3.industryNote !== null && r3.industryNote.includes('auto-components'), 'differing industry shown for both sides');

// ── sparse data doesn't crash or invent ──
const r4 = buildSynergyReview(
    { intent: 'BUY_SIDE', sector: null, industry: null, geography: null, dealMin: null, dealMax: null, revMin: null, revMax: null },
    { intent: 'SELL_SIDE', sector: null, industry: null, geography: null, dealMin: null, dealMax: null, revMin: null, revMax: null },
    50,
);
ok(r4.industryNote === null, 'no industry -> no industry note');
ok(/not fully disclosed/i.test(r4.financialFit), 'no sizes -> honest "not disclosed"');
ok(/not disclosed/i.test(r4.geographyFit), 'no geo -> honest "not disclosed"');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);