import { describe, it, expect } from "vitest";
import { remergeConcurrentState } from "../chatPipeline";
import { createBlankState, type RouterState } from "../promptRouter";

/**
 * Regression guard for the P0 "WhatsApp chatbot forgets what the user just
 * said" bug: two rapid WhatsApp messages race on chat_sessions.state_version;
 * the losing OCC write used to silently drop that turn's parsed fields. Now
 * the losing turn re-merges over the concurrent write and retries — this
 * function decides the merge.
 */
describe("remergeConcurrentState", () => {
  const blank = createBlankState();
  const st = (o: Record<string, unknown>): RouterState => ({ ...blank, ...o }) as RouterState;

  it("this turn's freshly-extracted fields win over the concurrent write", () => {
    const concurrent = { intent: "BUY_SIDE", sector: "saas", geography: "Pune" } as Partial<RouterState>;
    const thisTurn = st({ intent: "BUY_SIDE", sector: "saas", geography: "Pune", deal_size: "50 Cr" });
    const merged = remergeConcurrentState(blank, concurrent, thisTurn);
    expect(merged.deal_size).toBe("50 Cr"); // added this turn — must survive
    expect(merged.geography).toBe("Pune");
    expect(merged.intent).toBe("BUY_SIDE");
  });

  it("concurrent write backfills fields this turn did not touch", () => {
    const concurrent = { intent: "BUY_SIDE", sector: "saas", revenue: "100 Cr" } as Partial<RouterState>;
    const thisTurn = st({ intent: "BUY_SIDE", sector: "saas", structure: "100% acquisition" });
    const merged = remergeConcurrentState(blank, concurrent, thisTurn);
    expect(merged.revenue).toBe("100 Cr"); // kept from the concurrent write
    expect(merged.structure).toBe("100% acquisition"); // kept from this turn
  });

  it("never regresses to a blank mandate when the concurrent read is null/empty", () => {
    const thisTurn = st({ intent: "SELL_SIDE", sector: "manufacturing", geography: "Mumbai" });
    expect(remergeConcurrentState(blank, null, thisTurn)).toMatchObject({
      intent: "SELL_SIDE",
      sector: "manufacturing",
      geography: "Mumbai",
    });
    expect(remergeConcurrentState(blank, {}, thisTurn).sector).toBe("manufacturing");
  });

  it("keeps a completed/captured flag once either side has set it", () => {
    const thisTurn = st({ is_complete: true, is_captured: true, phase: "CLOSURE" });
    const merged = remergeConcurrentState(blank, { is_complete: false } as Partial<RouterState>, thisTurn);
    expect(merged.is_complete).toBe(true);
    expect(merged.is_captured).toBe(true);
  });
});
