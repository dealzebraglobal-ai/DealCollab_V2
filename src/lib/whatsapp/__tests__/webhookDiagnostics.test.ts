import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { newWaCtx, waLog, describePgError } from "../webhookDiagnostics";

describe("newWaCtx", () => {
  it("generates a correlation id and starts with responseSent=false", () => {
    const ctx = newWaCtx("wamid.abc", "918850333250");
    expect(ctx.correlationId).toBeTruthy();
    expect(ctx.providerMessageId).toBe("wamid.abc");
    expect(ctx.responseSent).toBe(false);
    expect(typeof ctx.startedAt).toBe("number");
  });

  it("reduces the phone to a last-4 tag and never stores the full number", () => {
    const ctx = newWaCtx(null, "+91 88503 33250");
    expect(ctx.phoneTag).toBe("…3250");
    expect(JSON.stringify(ctx)).not.toContain("8850333250");
  });

  it("phoneTag is null when no phone is given", () => {
    expect(newWaCtx(null).phoneTag).toBeNull();
    expect(newWaCtx(null, "").phoneTag).toBeNull();
  });

  it("distinct calls get distinct correlation ids", () => {
    expect(newWaCtx(null).correlationId).not.toBe(newWaCtx(null).correlationId);
  });
});

describe("waLog", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  it("emits `[WA <STAGE> <RESULT>]` with cid / pmid / phone / ms and extras", () => {
    const ctx = newWaCtx("wamid.xyz", "918850333250");
    waLog(ctx, "USER_CREATED", "FAILED", { code: "23502", column: "name" });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [prefix, json] = logSpy.mock.calls[0] as [string, string];
    expect(prefix).toBe("[WA USER_CREATED FAILED]");
    const parsed = JSON.parse(json);
    expect(parsed).toMatchObject({
      cid: ctx.correlationId,
      pmid: "wamid.xyz",
      phone: "…3250",
      code: "23502",
      column: "name",
    });
    expect(typeof parsed.ms).toBe("number");
  });

  it("never includes the raw phone number", () => {
    const ctx = newWaCtx(null, "918850333250");
    waLog(ctx, "WEBHOOK_RECEIVED", "START");
    expect(String(logSpy.mock.calls[0][1])).not.toContain("8850333250");
  });
});

describe("describePgError (re-exported)", () => {
  it("surfaces SQLSTATE + column, not row values", () => {
    const pgErr = Object.assign(new Error('null value in column "name" violates not-null constraint'), {
      code: "23502",
      column: "name",
      table: "users",
      detail: "Failing row contains (uuid, 918850333250@dealcollab.ai).",
    });
    const info = describePgError(pgErr);
    expect(info.code).toBe("23502");
    expect(info.column).toBe("name");
    expect(JSON.stringify(info)).not.toContain("dealcollab.ai");
  });
});
