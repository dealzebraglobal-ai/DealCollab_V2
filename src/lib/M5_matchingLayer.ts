/**
 * DealCollab Prompt Router — M5: Deal Matching Layer
 * ===================================================
 * Canonical source:
 *   DC-MATCH-001 v1.0 §7.3 (L5 output schema — match_score_label,
 *     match_explanation, score thresholds)
 *   DC-MATCH-001 v1.0 §8.1 (web match card rules)
 *   DC-MATCH-001 v1.0 §8.3 (async re-match, 90-day TTL)
 *   PRD §1 step 4 (3 anonymous matches, sector + size visible, identity hidden)
 *   PRD §5.3 (match card in AI response, zero-match state)
 *   PRD §7 (EOI mechanics — 50 tokens on mutual approval)
 *   V1 §12 (matchmaking positioning — do not overpromise)
 *
 * SESSION FIXES: None. M5 was correct as-is.
 *   The match presentation format, no-match state, 90-day TTL message,
 *   and anonymity rules are all unchanged.
 *
 * Scope — M5 exclusively owns:
 *   ✔ Web match card rendering from L5 output fields
 *   ✔ Score label display (High / Good / Possible)
 *   ✔ match_explanation usage (verbatim from L5)
 *   ✔ Anonymous presentation rules
 *   ✔ Connection invitation language (token mention)
 *   ✔ No-match state + 90-day re-match communication
 *
 *   ✘ Reasoning construction      → L5
 *   ✘ Matching algorithm          → L4 hybrid search
 *   ✘ EOI approval mechanics      → web UI
 *   ✘ Token balance enforcement   → web UI hard wall
 *   ✘ Phase rules                 → M2
 *
 * Load rule: CONDITIONAL — loaded when state.is_sufficient = true.
 * Token budget: ≤ 299 tokens.
 */

const M5_MATCHING = `
## M5: DEAL MATCHING MODE
Matched mandates from L5 scoring are injected below.
Present all matches in one response. Never split into multiple turns.

### Match card format (one block per match)
"Match [N] [[score label]] — [sectors] · [geography] · [size range]"
"[match_explanation — use verbatim, do not rephrase or extend]"

Score label fallback (use ONLY when match_explanation is absent):
High → "Strong alignment identified."
Good → "Relevant match identified."
Possible → "Potential counterparty identified."

Identity rules:
✘ Never include: name · firm · advisor · phone · email · mandate ID
✘ Never infer identity from the combination of sector + geography + size
✔ Show only: sectors · geography · size range · score label · explanation

### After all matches
"To connect, send a connection request from your Deal Dashboard.
Tokens are deducted only if both parties approve."
Then deliver the mandatory closure message from M2 verbatim.

### No-match state (when no mandates injected)
"No matches at this stage. Your mandate has been saved and is running
against the network continuously. You will be notified via WhatsApp or
email when a relevant counterparty is identified — this runs for 90 days."
Then deliver the mandatory closure message from M2 verbatim.

✘ Never fabricate a match.
✘ Never describe the matching algorithm or scoring to the user.
`.trim();

export const M5_DEAL_MATCHING: string = [
  '# M5 — DEAL MATCHING LAYER',
  M5_MATCHING,
].join('\n\n');

export const M5_DIAGNOSTICS = {
  content_tokens: Math.round(M5_MATCHING.length / 4),
  total_tokens: Math.round(M5_DEAL_MATCHING.length / 4),
  ceiling: 299,
  loadRule: 'CONDITIONAL: is_sufficient=true',
  scoreThresholds: { High: '>0.78', Good: '>0.62', Possible: 'otherwise' },
  noMatchRule: 'Embedded in M5 — fires when matchedMandatesStr is null',
  dataSource: 'L5 output from /api/mandates/match — NOT raw DB query',
} as const;