/**
 * DealCollab — WhatsApp match navigation state + pagination (pure)
 * ==============================================================
 * The WhatsApp chatbot shows the top 3 counterparties, but the matchmaking
 * engine persists the top 10 into `proposal_matches`. "Show me more" must
 * page through the rows already on disk — WITHOUT re-running the engine or
 * the LLM, WITHOUT repeating a company already shown, and WITHOUT trusting
 * the P1/P2/P3 label as an identity (it is page-local and re-orders).
 *
 * Everything here is pure and lives in `chat_sessions.whatsapp_ui_state`
 * (existing JSONB column) — no new table, no migration.
 */

export type WhatsAppUiScreen =
  | "PROPOSAL_LIST"
  | "COUNTERPARTY_DETAIL"
  | "NO_MORE_MATCHES"
  | null;

export interface WhatsAppUiState {
  screen: WhatsAppUiScreen;
  /** Legacy: 0-based index of the counterparty currently open on COUNTERPARTY_DETAIL. */
  index?: number;
  /** The user's proposal the shown matches belong to (guards stale state after a re-match). */
  proposalId?: string;
  /**
   * Ordered `proposal_matches.id` values currently rendered as P1..Pn on the
   * PROPOSAL_LIST screen. A bare "1"/"2"/"3" reply resolves against THIS list,
   * never against a fresh "top 3 by score" query (which would open the wrong
   * company after a "show more" page turn).
   */
  pageMatchIds?: string[];
  /**
   * Every `matched_proposal_id` shown to this user for this proposal so far,
   * across all pages — the exclusion set for "show more".
   */
  shownMatchedProposalIds?: string[];
  /** 1-based page number currently displayed. */
  page?: number;
}

export interface MatchRowLike {
  id: string;
  matchedProposalId: string;
  finalScore: number | string;
}

export interface MatchPageResult<T extends MatchRowLike> {
  page: T[];
  /** Eligible rows remaining after this page (not yet shown, deduped). */
  remaining: number;
}

/**
 * Deterministic next page of matches:
 *   1. drop rows whose company (`matchedProposalId`) was already shown,
 *   2. dedupe by `matchedProposalId` (defensive — forward + reciprocal rows,
 *      or an engine re-run, can produce two match rows for one company),
 *   3. stable order: final_score desc, then id asc (tie-break is immutable),
 *   4. take `limit`.
 */
export function selectMatchPage<T extends MatchRowLike>(
  rows: readonly T[],
  alreadyShownMatchedProposalIds: readonly string[],
  limit: number,
): MatchPageResult<T> {
  const shown = new Set(alreadyShownMatchedProposalIds);
  const seen = new Set<string>();
  const eligible: T[] = [];

  for (const r of rows) {
    if (!r || !r.matchedProposalId) continue;
    if (shown.has(r.matchedProposalId)) continue;
    if (seen.has(r.matchedProposalId)) continue;
    seen.add(r.matchedProposalId);
    eligible.push(r);
  }

  eligible.sort((a, b) => {
    const d = num(b.finalScore) - num(a.finalScore);
    return d !== 0 ? d : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });

  return { page: eligible.slice(0, limit), remaining: Math.max(0, eligible.length - limit) };
}

function num(v: number | string): number {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse a structured VIEW_MATCH button postback: `VIEW_MATCH:<uuid>` or
 * `VIEW_<uuid>`. Returns the stable `proposal_matches.id`, or null if the
 * text is not such a token (a bare digit / "P2" is handled elsewhere).
 */
export function parseViewMatchToken(text: string): { matchId: string } | null {
  const m = text.trim().match(/^VIEW(?:_MATCH)?[:_ ]([0-9a-f-]{6,})$/i);
  return m ? { matchId: m[1] } : null;
}
