/**
 * DealCollab — WhatsApp inbound command classifier
 * ===================================================
 * Pure, dependency-free (no db/chatPipeline imports) so it can be unit
 * tested directly — same rationale as resolveCompletion.ts's extraction:
 * these decisions used to live inline in processIncomingMessage (chatbot.ts)
 * where they could only be exercised through a real DB + AI call.
 */

export type { WhatsAppUiScreen } from "./matchNav";
import type { WhatsAppUiScreen } from "./matchNav";
import { parseViewMatchToken } from "./matchNav";

export type WhatsAppCommand =
  | { type: "OPEN_WEBSITE" }
  | { type: "FINISH" }
  // `index` is the page-local 0-based position (P1 = 0…); `matchId` is the
  // stable proposal_matches.id from a button postback. When `matchId` is
  // present it is authoritative — `index` is only the numbered-text fallback.
  | { type: "VIEW_MATCH"; index: number; matchId?: string }
  | { type: "BACK_TO_PROPOSALS" }
  | { type: "SHOW_MORE" }
  | { type: "BROADEN_CRITERIA" }
  | { type: "RESET" }
  | { type: "CHAT" };

/**
 * `screen` is the WhatsApp-only UI context the conversation is currently in
 * (chat_sessions.whatsapp_ui_state) — it disambiguates what a bare "1"/"2"/"3"
 * reply means, since the counterparty-detail screen and the proposal-list
 * screen assign different meanings to the same digits:
 *
 *   PROPOSAL_LIST:        1/2/3 → View P1/P2/P3
 *   COUNTERPARTY_DETAIL:  1 → Back to proposals, 2 → Open Website, 3 → Start Over
 *
 * An explicit "P2" / "view p2" / "VIEW_P2" (button postback, or a user
 * typing a specific proposal directly) always means VIEW_MATCH regardless of
 * screen — only a BARE digit is context-dependent.
 *
 * FINISH is checked before the screen-dependent digit handling intentionally,
 * but note it is NOT the default outcome of a completed mandate — it only
 * matches an explicit wrap-up phrase. Everything else (a completed mandate +
 * an ordinary follow-up message) falls through to CHAT, where the shared
 * pipeline's own is_captured terminal lock (resolveCompletion.ts) handles
 * "conversation continues after the mandate is done" without resetting
 * anything in the WhatsApp adapter.
 */
export function classifyWhatsAppCommand(text: string, screen: WhatsAppUiScreen = null): WhatsAppCommand {
  const trimmed = text.trim();

  // Structured button postback carrying a stable proposal_matches.id —
  // authoritative, screen-independent.
  const viewToken = parseViewMatchToken(trimmed);
  if (viewToken) {
    return { type: "VIEW_MATCH", index: -1, matchId: viewToken.matchId };
  }
  if (/^(show_?more|broaden(_criteria)?)$/i.test(trimmed)) {
    return /broaden/i.test(trimmed) ? { type: "BROADEN_CRITERIA" } : { type: "SHOW_MORE" };
  }

  if (/^(open_?website|website|login|web|portal)\b/i.test(trimmed)) {
    return { type: "OPEN_WEBSITE" };
  }

  if (
    /^(done|finish(ed)?|that'?s all|no more( questions)?|exit|end|complete|i am done|i'm done|we'?re done|i don'?t need anything else)\b/i.test(
      trimmed,
    ) && !/^no more matches\b/i.test(trimmed)
  ) {
    return { type: "FINISH" };
  }

  // "show me more" / "more matches" / "next" / "any other options" / "find more"
  if (
    /^(show(\s+me)?\s+more|more(\s+matches|\s+companies|\s+options)?|next(\s+matches)?|any\s+other(\s+options)?|other\s+options|find\s+more|no\s+more\s+matches)\b/i.test(
      trimmed,
    )
  ) {
    return { type: "SHOW_MORE" };
  }

  if (/^(broaden|widen|expand)(\s+(the\s+)?criteria)?\b/i.test(trimmed)) {
    return { type: "BROADEN_CRITERIA" };
  }

  if (/^back[_\s]?to[_\s]?proposals$/i.test(trimmed)) {
    return { type: "BACK_TO_PROPOSALS" };
  }

  // Explicit proposal reference (button postback like "VIEW_P2", or a user
  // directly typing "P3") always means VIEW_MATCH, independent of screen.
  const explicitViewMatch = trimmed.match(/^view[_\s]?p([1-3])$/i) || trimmed.match(/^p([1-3])$/i);
  if (explicitViewMatch) {
    return { type: "VIEW_MATCH", index: parseInt(explicitViewMatch[1], 10) - 1 };
  }

  // A bare digit's meaning depends on which screen is currently displayed.
  const bareDigit = trimmed.match(/^([1-3])$/);
  if (bareDigit) {
    const n = parseInt(bareDigit[1], 10);
    if (screen === "COUNTERPARTY_DETAIL") {
      if (n === 1) return { type: "BACK_TO_PROPOSALS" };
      if (n === 2) return { type: "OPEN_WEBSITE" };
      return { type: "RESET" }; // n === 3
    }
    if (screen === "NO_MORE_MATCHES") {
      return n === 1 ? { type: "BROADEN_CRITERIA" } : { type: "CHAT" };
    }
    // PROPOSAL_LIST screen (or no tracked screen — the pre-existing default)
    return { type: "VIEW_MATCH", index: n - 1 };
  }

  if (/^(start over|reset|new mandate|clear|restart|new deal)\b/i.test(trimmed)) {
    return { type: "RESET" };
  }

  return { type: "CHAT" };
}
