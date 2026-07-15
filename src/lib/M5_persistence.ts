/**
 * DealCollab — M5: Matchmaking Persistence Builders
 * =================================================
 * Place at: src/lib/M5_persistence.ts
 *
 * PURE payload builders for the persistence layer. Zero I/O, zero side effects.
 * matchmakingEngine.ts calls these, then performs the Supabase writes itself.
 * Keeping them pure makes them unit-testable; the DB writes are live-only.
 *
 * One responsibility each:
 *   buildReciprocalRow()     — mirror a forward match (NEW->OLD) into OLD->NEW
 *   buildSavedSearchRecord() — the always-on watch row for a proposal
 *   buildBlindNotification() — an identity-safe alert for the OLD user
 */

import { normalizeSector } from './M5_sectorMatrix';

// Single store/notify floor (clarification #4: 60 everywhere now).
// Per-deal override lives in saved_searches.min_score for later, no redeploy.
export const MIN_MATCH_SCORE = 60;

// ─────────────────────────────────────────────────────────────
// 1. RECIPROCAL MATCH ROW
// ─────────────────────────────────────────────────────────────

export interface MatchRow {
    proposal_id: string;
    matched_proposal_id: string;
    similarity_score: number;
    industry_score: number;
    financial_score: number;
    geography_boost: number;
    confidence_score: number;
    final_score: number;
    match_reason: string;
    match_archetype: string;
    status: string;
}

/**
 * Mirror NEW->OLD into OLD->NEW so the older user benefits from new deal flow.
 *
 * KNOWN, BOUNDED APPROXIMATION: scores are carried over unchanged. Semantic, industry,
 * financial and geography sub-scores are symmetric, so they are exact. Freshness (5% weight)
 * and the quality-tier bump (±5 flat) are computed from the candidate's side on the forward
 * row and are NOT recomputed here — the true reciprocal would. Max divergence ~≤8 points, and
 * it only matters within ~8 points of the 60 floor. Correct per-side recompute is the async
 * re-match worker's job (deferred). This is an approximation, not wrong data.
 *
 * `reverseReason` lets the caller pass a reason written from the SOURCE mandate's descriptor,
 * so the old user reads about the NEW proposal — not a description of their own deal.
 */
export function buildReciprocalRow(forward: MatchRow, reverseReason?: string): MatchRow {
    return {
        proposal_id: forward.matched_proposal_id,
        matched_proposal_id: forward.proposal_id,
        similarity_score: forward.similarity_score,
        industry_score: forward.industry_score,
        financial_score: forward.financial_score,
        geography_boost: forward.geography_boost,
        confidence_score: forward.confidence_score,
        final_score: forward.final_score,
        match_reason: reverseReason ?? forward.match_reason,
        match_archetype: forward.match_archetype,
        status: 'ACTIVE',
    };
}

// ─────────────────────────────────────────────────────────────
// 2. SAVED_SEARCHES WATCH RECORD
// ─────────────────────────────────────────────────────────────

export interface SavedSearchInput {
    userId: string;
    intent: string;
    sector: string | null;
    industry?: string | null;
    geography: string | null;
    structure: string | null;
    sub_sector: string | null;
    deal_size_min: string | null;
    deal_size_max: string | null;
    revenue_min: string | null;
    revenue_max: string | null;
    special_conditions?: string[];
}

export interface SavedSearchRecord {
    user_id: string;
    proposal_id: string;
    query_object: Record<string, unknown>;
    query_embedding: number[];
    intent: string;
    sectors: string[];
    geographies: string[];
    min_score: number;
    status: string;
    match_count: number;
    match_attempt_count: number;
    last_checked_at: string;
    notification_status: string;
    no_match_reason: string | null;
}

const num = (v: string | null | undefined): number | null => {
    if (v == null) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
};

/**
 * Build the always-on watch row. `query_object` mirrors the live production key shape
 * (locked from real rows) PLUS the free-text industry. `query_embedding` is the
 * reversed-intent (counterparty-facing) embedding — re-match searches for counterparties,
 * so it must NOT reuse the proposal's own stored embedding.
 */
export function buildSavedSearchRecord(
    input: SavedSearchInput,
    proposalId: string,
    queryEmbedding: number[],
    matchCount: number,
    notified: boolean,
): SavedSearchRecord {
    const query_object: Record<string, unknown> = {
        intent: input.intent,
        sector: input.sector,
        industry: input.industry ?? null,
        geography: input.geography,
        structure: input.structure,
        sub_sector: input.sub_sector,
        revenue_min_cr: num(input.revenue_min),
        revenue_max_cr: num(input.revenue_max),
        deal_size_min_cr: num(input.deal_size_min),
        deal_size_max_cr: num(input.deal_size_max),
        special_conditions: input.special_conditions ?? [],
    };

    return {
        user_id: input.userId,
        proposal_id: proposalId,
        query_object,                    // NOT NULL in DB — the column the old broken insert omitted
        query_embedding: queryEmbedding,
        intent: input.intent,
        sectors: input.sector ? [normalizeSector(input.sector)] : [],
        geographies: input.geography ? [input.geography] : [],
        min_score: MIN_MATCH_SCORE,
        status: 'ACTIVE',               // always-on watch — not the old PENDING/zero-match queue
        match_count: matchCount,
        match_attempt_count: 1,         // this synchronous run is attempt #1; the async worker increments
        last_checked_at: new Date().toISOString(),
        notification_status: notified ? 'SENT' : 'NOT_SENT',
        no_match_reason: matchCount === 0 ? 'NO_CANDIDATE_ABOVE_MIN_SCORE' : null,
    };
}

// ─────────────────────────────────────────────────────────────
// 3. BLIND NOTIFICATION
// ─────────────────────────────────────────────────────────────

export interface BlindNotificationInput {
    oldUserId: string;             // recipient (older user)
    subjectProposalId: string;     // the recipient's OWN proposal this alert is about
    subjectRef: string;            // short human ref for the recipient's own proposal (e.g. "#A1B2C3")
    subjectIntent: string;         // recipient proposal intent  — names WHICH of their mandates this is for
    subjectSector: string | null;  // recipient proposal sector
    subjectGeography: string | null;// recipient proposal geography
    matchId: string | null;        // reciprocal match row id — dedup key + UI lookup
    cpSectorLabel: string | null;  // NEW counterparty's coarse sector only (no identity)
    cpGeographyLabel: string | null;
    finalScore: number;
}

export interface NotificationRecord {
    user_id: string;
    type: string;
    message: string;
    is_read: boolean;
    proposal_id: string;
    match_id: string | null;
    delivery_channels: string[];
    metadata: Record<string, unknown>;
}

// Indicative band only — never a fabricated %, never a raw score in user-facing text
// (M5_matchingLayer rule).
function band(score: number): string {
    if (score >= 75) return 'a strong';
    if (score >= 60) return 'a relevant';
    return 'a potential';
}

const INTENT_LABEL: Record<string, string> = {
    SELL_SIDE: 'Sell-side',
    BUY_SIDE: 'Buy-side',
    FUNDRAISING: 'Fundraising',
    DEBT: 'Debt',
    STRATEGIC_PARTNERSHIP: 'Partnership',
};

export function buildBlindNotification(p: BlindNotificationInput): NotificationRecord {
    // Counterparty side (NEW proposal): coarse sector + region ONLY. No identity.
    const what = p.cpSectorLabel ? ` ${p.cpSectorLabel}` : '';
    const where = p.cpGeographyLabel ? ` in ${p.cpGeographyLabel}` : '';

    // Recipient side (their OWN proposal): safe to name in full — it's their deal. This is what
    // lets a user with several mandates tell WHICH one the match is for.
    const mine = [INTENT_LABEL[p.subjectIntent] ?? p.subjectIntent, p.subjectSector, p.subjectGeography]
        .filter(Boolean)
        .join(' · ');
    const mandateLabel = mine ? `${p.subjectRef} (${mine})` : p.subjectRef;

    const message =
        `A new counterparty representing${what} demand${where} is ${band(p.finalScore)} match for your mandate ${mandateLabel}. ` +
        `Identity stays hidden until an Expression of Interest is exchanged.`;

    return {
        user_id: p.oldUserId,
        type: 'NEW_COUNTERPARTY',      // distinct from the legacy 'MATCH' type — cannot collide with the existing writer
        message,
        is_read: false,                // live column is boolean (the Drizzle file's text('is_read') is stale)
        proposal_id: p.subjectProposalId,
        match_id: p.matchId,
        delivery_channels: ['in_app'], // email/whatsapp deferred — v1 stores the record only
        metadata: { final_score: p.finalScore, blind: true, subject_ref: p.subjectRef },
    };
}