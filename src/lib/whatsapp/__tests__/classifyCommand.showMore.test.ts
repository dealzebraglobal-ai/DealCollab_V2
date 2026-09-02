import { describe, it, expect } from "vitest";
import { classifyWhatsAppCommand } from "../classifyCommand";

describe("classifyWhatsAppCommand — SHOW_MORE", () => {
  for (const phrase of [
    "show more",
    "Show me more",
    "more",
    "more matches",
    "more companies",
    "show me more companies",
    "next",
    "next matches",
    "any other options?",
    "other options",
    "find more",
  ]) {
    it(`"${phrase}" → SHOW_MORE`, () => {
      expect(classifyWhatsAppCommand(phrase, "PROPOSAL_LIST")).toEqual({ type: "SHOW_MORE" });
    });
  }

  it("the SHOW_MORE button postback id → SHOW_MORE", () => {
    expect(classifyWhatsAppCommand("SHOW_MORE", "PROPOSAL_LIST")).toEqual({ type: "SHOW_MORE" });
  });

  it('"no more matches" routes to SHOW_MORE, not FINISH', () => {
    expect(classifyWhatsAppCommand("no more matches", "PROPOSAL_LIST")).toEqual({ type: "SHOW_MORE" });
  });

  it('"no more questions" still → FINISH', () => {
    expect(classifyWhatsAppCommand("no more questions", "PROPOSAL_LIST")).toEqual({ type: "FINISH" });
  });
});

describe("classifyWhatsAppCommand — BROADEN_CRITERIA", () => {
  it("phrase and button id both map to BROADEN_CRITERIA", () => {
    expect(classifyWhatsAppCommand("broaden criteria", null)).toEqual({ type: "BROADEN_CRITERIA" });
    expect(classifyWhatsAppCommand("BROADEN_CRITERIA", null)).toEqual({ type: "BROADEN_CRITERIA" });
    expect(classifyWhatsAppCommand("widen the criteria", null)).toEqual({ type: "BROADEN_CRITERIA" });
  });

  it('on the NO_MORE_MATCHES screen, "1" → BROADEN_CRITERIA', () => {
    expect(classifyWhatsAppCommand("1", "NO_MORE_MATCHES")).toEqual({ type: "BROADEN_CRITERIA" });
  });

  it('on the NO_MORE_MATCHES screen, "2" is inert (CHAT)', () => {
    expect(classifyWhatsAppCommand("2", "NO_MORE_MATCHES")).toEqual({ type: "CHAT" });
  });
});

describe("classifyWhatsAppCommand — stable VIEW_MATCH id", () => {
  it("VIEW_MATCH:<uuid> postback carries the id, index = -1", () => {
    expect(classifyWhatsAppCommand("VIEW_MATCH:8f3a91c0-dead-beef-0000-111122223333", "PROPOSAL_LIST")).toEqual({
      type: "VIEW_MATCH",
      index: -1,
      matchId: "8f3a91c0-dead-beef-0000-111122223333",
    });
  });

  it("a bare digit on PROPOSAL_LIST still yields a page-local index (no matchId)", () => {
    expect(classifyWhatsAppCommand("2", "PROPOSAL_LIST")).toEqual({ type: "VIEW_MATCH", index: 1 });
  });

  it("regression: existing bare-digit / P-label / back-postback behaviour unchanged", () => {
    expect(classifyWhatsAppCommand("1", "COUNTERPARTY_DETAIL")).toEqual({ type: "BACK_TO_PROPOSALS" });
    expect(classifyWhatsAppCommand("P3", "PROPOSAL_LIST")).toEqual({ type: "VIEW_MATCH", index: 2 });
    expect(classifyWhatsAppCommand("BACK_TO_PROPOSALS", null)).toEqual({ type: "BACK_TO_PROPOSALS" });
    expect(classifyWhatsAppCommand("Done", "COUNTERPARTY_DETAIL")).toEqual({ type: "FINISH" });
  });
});
