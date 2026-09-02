import { describe, it, expect } from "vitest";
import { classifyWhatsAppCommand } from "../classifyCommand";

/**
 * Regression guard (2026-09-02): natural-language SHOW_MORE / BROADEN phrases
 * must ONLY route deterministically while a match screen is displayed. During
 * mandate collection (screen === null) every ordinary sentence — including
 * ones starting with "expand" / "more" / "next" — must fall through to CHAT
 * so the AI conversation handles it.
 */

describe("classifyWhatsAppCommand — SHOW_MORE (only on a match screen)", () => {
  const phrases = [
    "show more",
    "Show me more",
    "more matches",
    "more companies",
    "more options",
    "any other options",
    "other options",
    "next matches",
  ];

  for (const phrase of phrases) {
    it(`"${phrase}" on PROPOSAL_LIST → SHOW_MORE`, () => {
      expect(classifyWhatsAppCommand(phrase, "PROPOSAL_LIST")).toEqual({ type: "SHOW_MORE" });
    });
    it(`"${phrase}" during mandate collection (null screen) → CHAT`, () => {
      expect(classifyWhatsAppCommand(phrase, null)).toEqual({ type: "CHAT" });
    });
  }

  it("the SHOW_MORE button postback id works on any screen", () => {
    expect(classifyWhatsAppCommand("SHOW_MORE", null)).toEqual({ type: "SHOW_MORE" });
    expect(classifyWhatsAppCommand("SHOW_MORE", "PROPOSAL_LIST")).toEqual({ type: "SHOW_MORE" });
  });

  it('"no more questions" still → FINISH', () => {
    expect(classifyWhatsAppCommand("no more questions", "PROPOSAL_LIST")).toEqual({ type: "FINISH" });
  });
});

describe("classifyWhatsAppCommand — REGRESSION: mandate answers are never commands", () => {
  const mandateAnswers = [
    "Expand my company in different sector",
    "Expand into a different sector",
    "Ecommerce",
    "Products and its revenue should be around 100 Cr",
    "I wanna buy SAAS company in Pune and my budget is 50 Cr",
    "I want to buy a defence company in Mumbai and want to acquire it in a range of 100 Cr",
    "more revenue detail: about 40 Cr EBITDA",
    "next, the certifications are ISO 9001",
    "broaden manufacturing capacity to 2 plants",
    "widen distribution across south India",
  ];
  for (const msg of mandateAnswers) {
    it(`"${msg}" (null screen) → CHAT`, () => {
      expect(classifyWhatsAppCommand(msg, null)).toEqual({ type: "CHAT" });
    });
  }
});

describe("classifyWhatsAppCommand — BROADEN_CRITERIA", () => {
  it("exact button id maps on any screen", () => {
    expect(classifyWhatsAppCommand("BROADEN_CRITERIA", null)).toEqual({ type: "BROADEN_CRITERIA" });
  });
  it('"broaden the criteria" phrase routes only on a match screen', () => {
    expect(classifyWhatsAppCommand("broaden the criteria", "NO_MORE_MATCHES")).toEqual({ type: "BROADEN_CRITERIA" });
    expect(classifyWhatsAppCommand("broaden the criteria", null)).toEqual({ type: "CHAT" });
  });
  it('on NO_MORE_MATCHES, "1" → BROADEN_CRITERIA, "2" is inert (CHAT)', () => {
    expect(classifyWhatsAppCommand("1", "NO_MORE_MATCHES")).toEqual({ type: "BROADEN_CRITERIA" });
    expect(classifyWhatsAppCommand("2", "NO_MORE_MATCHES")).toEqual({ type: "CHAT" });
  });
});

describe("classifyWhatsAppCommand — stable VIEW_MATCH id + regression on originals", () => {
  it("VIEW_MATCH:<uuid> postback carries the id, index = -1", () => {
    expect(classifyWhatsAppCommand("VIEW_MATCH:8f3a91c0-dead-beef-0000-111122223333", "PROPOSAL_LIST")).toEqual({
      type: "VIEW_MATCH",
      index: -1,
      matchId: "8f3a91c0-dead-beef-0000-111122223333",
    });
  });

  it("original behaviours unchanged", () => {
    expect(classifyWhatsAppCommand("2", "PROPOSAL_LIST")).toEqual({ type: "VIEW_MATCH", index: 1 });
    expect(classifyWhatsAppCommand("2", null)).toEqual({ type: "VIEW_MATCH", index: 1 }); // pre-existing default
    expect(classifyWhatsAppCommand("1", "COUNTERPARTY_DETAIL")).toEqual({ type: "BACK_TO_PROPOSALS" });
    expect(classifyWhatsAppCommand("P3", "PROPOSAL_LIST")).toEqual({ type: "VIEW_MATCH", index: 2 });
    expect(classifyWhatsAppCommand("VIEW_P3", "COUNTERPARTY_DETAIL")).toEqual({ type: "VIEW_MATCH", index: 2 });
    expect(classifyWhatsAppCommand("BACK_TO_PROPOSALS", null)).toEqual({ type: "BACK_TO_PROPOSALS" });
    expect(classifyWhatsAppCommand("Done", "COUNTERPARTY_DETAIL")).toEqual({ type: "FINISH" });
    expect(classifyWhatsAppCommand("start over", "PROPOSAL_LIST")).toEqual({ type: "RESET" });
    expect(classifyWhatsAppCommand("website", null)).toEqual({ type: "OPEN_WEBSITE" });
  });
});
