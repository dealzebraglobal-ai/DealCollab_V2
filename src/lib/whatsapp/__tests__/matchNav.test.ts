import { describe, it, expect } from "vitest";
import {
  selectMatchPage,
  parseViewMatchToken,
  formatProposalListMessage,
  firstSentence,
  crRange,
  type MatchRowLike,
  type MatchCard,
} from "../matchNav";

const row = (id: string, matchedProposalId: string, finalScore: number | string): MatchRowLike => ({
  id,
  matchedProposalId,
  finalScore,
});

describe("selectMatchPage — pagination / dedup / exclusion", () => {
  it("returns the top-N by score with a stable id tie-break", () => {
    const rows = [
      row("m3", "cA", 77),
      row("m1", "cB", 85),
      row("m2", "cC", 77),
    ];
    const { page, remaining } = selectMatchPage(rows, [], 3);
    expect(page.map((r) => r.id)).toEqual(["m1", "m2", "m3"]); // 85, then 77s by id asc
    expect(remaining).toBe(0);
  });

  it("test 9: the SAME company appearing in multiple match rows collapses to one candidate", () => {
    const rows = [
      row("m1", "cDup", 90),
      row("m2", "cDup", 88), // forward + reciprocal row for one company
      row("m3", "cOther", 70),
    ];
    const { page } = selectMatchPage(rows, [], 3);
    expect(page.map((r) => r.matchedProposalId)).toEqual(["cDup", "cOther"]);
  });

  it("test 11/12: previously shown companies are excluded on the next page", () => {
    const rows = [
      row("m1", "cA", 90),
      row("m2", "cB", 80),
      row("m3", "cC", 70),
      row("m4", "cD", 60),
      row("m5", "cE", 50),
    ];
    const first = selectMatchPage(rows, [], 3);
    expect(first.page.map((r) => r.matchedProposalId)).toEqual(["cA", "cB", "cC"]);
    expect(first.remaining).toBe(2);

    const shown = first.page.map((r) => r.matchedProposalId);
    const second = selectMatchPage(rows, shown, 3);
    expect(second.page.map((r) => r.matchedProposalId)).toEqual(["cD", "cE"]);
    expect(second.remaining).toBe(0);

    const third = selectMatchPage(rows, [...shown, "cD", "cE"], 3);
    expect(third.page).toEqual([]);
    expect(third.remaining).toBe(0);
  });

  it("test 13: when only two legitimate rows exist, returns two — never pads to three", () => {
    const rows = [row("m1", "cA", 90), row("m2", "cB", 80)];
    expect(selectMatchPage(rows, [], 3).page).toHaveLength(2);
  });

  it("test 14: no eligible rows → empty page, remaining 0", () => {
    expect(selectMatchPage([], [], 3)).toEqual({ page: [], remaining: 0 });
    expect(selectMatchPage([row("m1", "cA", 90)], ["cA"], 3)).toEqual({ page: [], remaining: 0 });
  });

  it("tolerates string scores (numeric column comes back as text)", () => {
    const rows = [row("m1", "cA", "77.0"), row("m2", "cB", "85")];
    expect(selectMatchPage(rows, [], 3).page.map((r) => r.id)).toEqual(["m2", "m1"]);
  });

  it("skips rows with no matchedProposalId", () => {
    const rows = [{ id: "m1", matchedProposalId: "", finalScore: 90 } as MatchRowLike, row("m2", "cB", 80)];
    expect(selectMatchPage(rows, [], 3).page.map((r) => r.id)).toEqual(["m2"]);
  });
});

describe("parseViewMatchToken", () => {
  it("parses VIEW_MATCH:<uuid> button postbacks", () => {
    expect(parseViewMatchToken("VIEW_MATCH:8f3a91c0-1111-2222-3333-444455556666")).toEqual({
      matchId: "8f3a91c0-1111-2222-3333-444455556666",
    });
  });
  it("parses the short VIEW_<id> and VIEW <id> forms case-insensitively", () => {
    expect(parseViewMatchToken("view_8f3a91c0dead")).toEqual({ matchId: "8f3a91c0dead" });
    expect(parseViewMatchToken("VIEW ab12cd34")).toEqual({ matchId: "ab12cd34" });
  });
  it("returns null for bare digits, P-labels and free text", () => {
    expect(parseViewMatchToken("2")).toBeNull();
    expect(parseViewMatchToken("P2")).toBeNull();
    expect(parseViewMatchToken("VIEW_P2")).toBeNull(); // 'P2' is not a hex id
    expect(parseViewMatchToken("show me more")).toBeNull();
  });
});

describe("crRange / firstSentence", () => {
  it("crRange formats single value and range, tolerates strings/nulls", () => {
    expect(crRange(20, 20)).toBe("₹20 Cr");
    expect(crRange("18", "22")).toBe("₹18–22 Cr");
    expect(crRange(null, "30")).toBe("₹30 Cr");
    expect(crRange(null, null)).toBeNull();
    expect(crRange("", "")).toBeNull();
    expect(crRange(20.75, null)).toBe("₹20.8 Cr");
  });
  it("firstSentence takes the first sentence and caps length", () => {
    expect(firstSentence("Strategic acquisition in Pune. Revenue ₹100 Cr.")).toBe("Strategic acquisition in Pune.");
    expect(firstSentence(null)).toBeNull();
    expect(firstSentence("x".repeat(200))!.length).toBeLessThanOrEqual(140);
  });
});

describe("formatProposalListMessage — distinct cards, no fabrication", () => {
  const base: MatchCard = { rank: "P1", finalScore: 85, scoreLabel: "High Confidence" };

  it("renders each candidate's OWN city / size / structure / summary", () => {
    const msg = formatProposalListMessage([
      { ...base, rank: "P1", sector: "manufacturing", city: "Pune", sizeLabel: "₹18–22 Cr", structure: "100% acquisition", summaryLine: "Defence OEM with in-house machining." },
      { ...base, rank: "P2", finalScore: 77, sector: "defence", city: "Nashik", sizeLabel: "₹25 Cr", structure: "majority stake", summaryLine: "Avionics sub-systems supplier to HAL." },
    ]);
    expect(msg).toContain("manufacturing · Pune");
    expect(msg).toContain("defence · Nashik");
    expect(msg).toContain("₹18–22 Cr · 100% acquisition");
    expect(msg).toContain("₹25 Cr · majority stake");
    expect(msg).toContain("Defence OEM with in-house machining.");
    expect(msg).toContain("Avionics sub-systems supplier to HAL.");
  });

  it("appends the stable #REF only when two summary lines are byte-identical", () => {
    const identical = "Same-sector consolidation opportunity.";
    const msg = formatProposalListMessage([
      { ...base, rank: "P1", sector: "defence", city: "Maharashtra", summaryLine: identical, ref: "#AAA111" },
      { ...base, rank: "P2", sector: "defence", city: "Maharashtra", summaryLine: identical, ref: "#BBB222" },
      { ...base, rank: "P3", sector: "defence", city: "Maharashtra", summaryLine: "A genuinely different rationale.", ref: "#CCC333" },
    ]);
    expect(msg).toContain("#AAA111");
    expect(msg).toContain("#BBB222");
    expect(msg).not.toContain("#CCC333"); // its line is unique → no ref needed
  });

  it("falls back to matchReason then a neutral line — never invents facts", () => {
    const msg = formatProposalListMessage([{ ...base, sector: "saas", matchReason: "Exact sector + geography." }]);
    expect(msg).toContain("Exact sector + geography.");
    const bare = formatProposalListMessage([{ rank: "P1" }]);
    expect(bare).toContain("Aligned with your mandate criteria.");
  });
});
