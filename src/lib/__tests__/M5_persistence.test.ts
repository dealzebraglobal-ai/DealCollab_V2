/**
 * Harness for M5_persistence pure builders.
 * Run: npx tsx M5_persistence.test.ts
 * Covers payload SHAPE + identity-safety. DB writes are NOT covered here (live-only).
 */
import {
    MIN_MATCH_SCORE, buildReciprocalRow, buildSavedSearchRecord, buildBlindNotification,
    type MatchRow, type SavedSearchInput, type BlindNotificationInput,
} from '../M5_persistence';

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => { cond ? pass++ : (fail++, console.error('  FAIL:', msg)); };

// ── 1. reciprocal ──
const fwd: MatchRow = {
    proposal_id: 'NEW', matched_proposal_id: 'OLD',
    similarity_score: 0.7, industry_score: 1, financial_score: 0.5,
    geography_boost: 1, confidence_score: 0.5, final_score: 82,
    match_reason: 'describes OLD', match_archetype: 'Same-sector bolt-on', status: 'ACTIVE',
};
const rec = buildReciprocalRow(fwd, 'describes NEW');
ok(rec.proposal_id === 'OLD' && rec.matched_proposal_id === 'NEW', 'reciprocal swaps direction');
ok(rec.final_score === 82, 'reciprocal preserves final_score');
ok(rec.similarity_score === 0.7 && rec.industry_score === 1 && rec.geography_boost === 1, 'reciprocal preserves breakdown');
ok(rec.match_reason === 'describes NEW', 'reciprocal uses reverseReason override');
ok(rec.status === 'ACTIVE', 'reciprocal status ACTIVE');
ok(buildReciprocalRow(fwd).match_reason === 'describes OLD', 'reciprocal falls back to forward reason');

// ── 2. saved_search watch ──
const ssIn: SavedSearchInput = {
    userId: 'u1', intent: 'BUY_SIDE', sector: 'saas', industry: 'vertical SaaS for clinics',
    geography: 'Mumbai', structure: 'Majority', sub_sector: 'digital health',
    deal_size_min: '20', deal_size_max: '100', revenue_min: '10', revenue_max: '50',
    special_conditions: ['x'],
};
const ss = buildSavedSearchRecord(ssIn, 'P1', [0.1, 0.2, 0.3], 3, true);
ok(typeof ss.query_object === 'object' && ss.query_object !== null, 'query_object is object (NOT NULL fix)');
ok((ss.query_object as any).intent === 'BUY_SIDE', 'query_object carries intent');
ok((ss.query_object as any).industry === 'vertical SaaS for clinics', 'query_object carries free-text industry');
ok((ss.query_object as any).deal_size_max_cr === 100, 'query_object numeric coercion');
ok(Array.isArray(ss.query_embedding) && ss.query_embedding.length === 3, 'query_embedding present');
ok(ss.min_score === 60 && MIN_MATCH_SCORE === 60, 'min_score = 60 floor');
ok(ss.status === 'ACTIVE', 'watch status ACTIVE');
ok(ss.sectors[0] === 'TECHNOLOGY', 'sector normalized saas->TECHNOLOGY');
ok(ss.geographies[0] === 'Mumbai', 'geography carried');
ok(ss.match_count === 3 && ss.match_attempt_count === 1, 'match counts');
ok(ss.no_match_reason === null, 'no_match_reason null when matches found');
ok(ss.notification_status === 'SENT', 'notification_status SENT when notified');
const ss0 = buildSavedSearchRecord(ssIn, 'P1', [0.1], 0, false);
ok(ss0.no_match_reason === 'NO_CANDIDATE_ABOVE_MIN_SCORE' && ss0.notification_status === 'NOT_SENT', 'no-match watch fields');

// ── 3. blind notification ──
const nIn: BlindNotificationInput = {
    oldUserId: 'old-user', subjectProposalId: 'OLDPROP', matchId: 'M1',
    sectorLabel: 'TECHNOLOGY', geographyLabel: 'Mumbai', finalScore: 82,
};
const n = buildBlindNotification(nIn);
ok(n.user_id === 'old-user', 'notification targets OLD user');
ok(n.type === 'NEW_COUNTERPARTY', 'distinct type, no MATCH collision');
ok(n.is_read === false, 'is_read boolean false');
ok(n.match_id === 'M1', 'match_id passthrough (dedup key)');
ok(n.proposal_id === 'OLDPROP', 'proposal_id = recipient own proposal');
ok(Array.isArray(n.delivery_channels) && n.delivery_channels.includes('in_app'), 'delivery_channels in_app');
ok((n.metadata as any).blind === true, 'metadata flagged blind');
ok(!/\d{10}/.test(n.message), 'no phone-like sequence in message');
ok(!/ltd|pvt|advisor|@/i.test(n.message), 'no identity tokens in message');
ok(/strong/.test(n.message), 'band word present for score 82');
ok(n.message.includes('TECHNOLOGY') && n.message.includes('Mumbai'), 'coarse sector+geo present');
ok(/potential/.test(buildBlindNotification({ ...nIn, finalScore: 61 }).message) === false, 'score 61 is not "potential"');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);