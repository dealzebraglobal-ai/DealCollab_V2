/**
 * DealCollab — WhatsApp inbound command classifier
 * ===================================================
 * Pure, dependency-free (no db/chatPipeline imports) so it can be unit
 * tested directly — same rationale as resolveCompletion.ts's extraction:
 * these decisions used to live inline in processIncomingMessage (chatbot.ts)
 * where they could only be exercised through a real DB + AI call.
 */

export type WhatsAppCommand =
  | { type: "OPEN_WEBSITE" }
  | { type: "FINISH" }
  | { type: "VIEW_MATCH"; index: number } // 0-based (P1 = 0, P2 = 1, P3 = 2)
  | { type: "RESET" }
  | { type: "CHAT" };

/**
 * FINISH is checked before VIEW_MATCH/RESET intentionally, but note it is
 * NOT the default outcome of a completed mandate — it only matches an
 * explicit wrap-up phrase. Everything else (a completed mandate + an
 * ordinary follow-up message) falls through to CHAT, where the shared
 * pipeline's own is_captured terminal lock (resolveCompletion.ts) handles
 * "conversation continues after the mandate is done" without resetting
 * anything in the WhatsApp adapter.
 */
export function classifyWhatsAppCommand(text: string): WhatsAppCommand {
  const trimmed = text.trim();

  if (/^(open_?website|website|login|web|portal)\b/i.test(trimmed)) {
    return { type: "OPEN_WEBSITE" };
  }

  if (
    /^(done|finish(ed)?|that'?s all|no more( questions)?|exit|end|complete|i am done|i'm done|we'?re done|i don'?t need anything else)\b/i.test(
      trimmed,
    )
  ) {
    return { type: "FINISH" };
  }

  // Real button taps (Meta) post back the literal id ("VIEW_P1"); WappBiz has
  // no button API, so its buttons degrade to a numbered plain-text list
  // (src/lib/whatsapp/wappbiz.ts) and the user's actual reply is a bare
  // "1"/"2"/"3". Match the WHOLE trimmed message so a normal sentence that
  // happens to start with a digit (e.g. "150 crore budget") is never
  // misread as a selection.
  const viewMatch = trimmed.match(/^(?:view[_\s]?p?)?([1-3])$/i);
  if (viewMatch) {
    return { type: "VIEW_MATCH", index: parseInt(viewMatch[1], 10) - 1 };
  }

  if (/^(start over|reset|new mandate|clear|restart|new deal)\b/i.test(trimmed)) {
    return { type: "RESET" };
  }

  return { type: "CHAT" };
}
