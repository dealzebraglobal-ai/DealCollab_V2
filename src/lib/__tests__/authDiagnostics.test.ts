import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  maskEmail,
  describeAuthError,
  authStep,
  wrapAdapterWithDiagnostics,
} from "../authDiagnostics";

describe("maskEmail", () => {
  it("redacts local part and domain but keeps the TLD", () => {
    expect(maskEmail("newuser@gmail.com")).toBe("n***@g***.com");
  });
  it("handles multi-label domains", () => {
    expect(maskEmail("a.b.c@mail.dealcollab.org")).toBe("a***@m***.org");
  });
  it("returns <none> for non-strings / malformed input", () => {
    expect(maskEmail(undefined)).toBe("<none>");
    expect(maskEmail(null)).toBe("<none>");
    expect(maskEmail("notanemail")).toBe("<none>");
  });
  it("never echoes the raw address", () => {
    const masked = maskEmail("sensitive.person@example.co");
    expect(masked).not.toContain("sensitive.person");
    expect(masked).not.toContain("example");
  });
});

describe("describeAuthError", () => {
  it("extracts pg SQLSTATE + column/constraint/table, never the row values", () => {
    const pgErr = Object.assign(new Error('invalid input syntax for type uuid: "10457"'), {
      code: "22P02",
      column: "id",
      table: "users",
      detail: "Failing row contains (10457, secret@x.com).", // must be dropped
    });
    const info = describeAuthError(pgErr);
    expect(info.code).toBe("22P02");
    expect(info.column).toBe("id");
    expect(info.table).toBe("users");
    expect(JSON.stringify(info)).not.toContain("secret@x.com");
    expect(JSON.stringify(info)).not.toContain("Failing row");
  });

  it("unwraps a nested cause (AdapterError → pg error)", () => {
    const pgErr = Object.assign(new Error("null value in column violates not-null constraint"), {
      code: "23502",
      column: "name",
    });
    const adapterErr = Object.assign(new Error("Adapter error while creating user"), {
      cause: pgErr,
    });
    const info = describeAuthError(adapterErr);
    expect(info.code).toBe("23502");
    expect(info.column).toBe("name");
  });

  it("truncates long messages", () => {
    const info = describeAuthError(new Error("x".repeat(5000)));
    expect(info.message.length).toBeLessThanOrEqual(200);
  });

  it("tolerates non-Error throwables", () => {
    expect(describeAuthError("boom").message).toBe("boom");
    expect(describeAuthError(undefined).errorClass).toBe("Error");
  });
});

describe("authStep", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  it("emits an `AUTH STEP <name>` line with serialised context", () => {
    authStep("google-user-create:start", { email: "n***@g***.com" });
    expect(logSpy).toHaveBeenCalledWith(
      "AUTH STEP google-user-create:start",
      JSON.stringify({ email: "n***@g***.com" }),
    );
  });
});

describe("wrapAdapterWithDiagnostics", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => logSpy.mockRestore());

  const steps = () => logSpy.mock.calls.map((c: unknown[]) => c[0]);

  it("logs the lookup result without altering it (existing user)", async () => {
    const base = {
      getUserByAccount: vi.fn().mockResolvedValue({ id: "uuid-1", email: "e@x.com" }),
      createUser: vi.fn(),
      linkAccount: vi.fn(),
    };
    const wrapped = wrapAdapterWithDiagnostics(base as never);
    const user = await wrapped.getUserByAccount!({ provider: "google", providerAccountId: "123" });
    expect(user).toEqual({ id: "uuid-1", email: "e@x.com" });
    expect(steps()).toContain("AUTH STEP google-user-lookup");
  });

  it("traces a successful new-user create + account link", async () => {
    const base = {
      getUserByAccount: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue({ id: "uuid-new", email: "n@x.com" }),
      linkAccount: vi.fn().mockResolvedValue(undefined),
    };
    const wrapped = wrapAdapterWithDiagnostics(base as never);
    await wrapped.createUser!({ email: "n@x.com" } as never);
    await wrapped.linkAccount!({ provider: "google", providerAccountId: "123" } as never);
    expect(steps()).toEqual(
      expect.arrayContaining([
        "AUTH STEP google-user-create:start",
        "AUTH STEP google-user-create:ok",
        "AUTH STEP google-account-create:start",
        "AUTH STEP google-account-create:ok",
      ]),
    );
  });

  it("re-throws a failing createUser but logs the pg diagnostics first", async () => {
    const pgErr = Object.assign(new Error("null value in column \"name\""), {
      code: "23502",
      column: "name",
      table: "users",
    });
    const base = {
      getUserByAccount: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockRejectedValue(pgErr),
      linkAccount: vi.fn(),
    };
    const wrapped = wrapAdapterWithDiagnostics(base as never);
    await expect(wrapped.createUser!({ email: "n@x.com" } as never)).rejects.toBe(pgErr);
    const failCall = logSpy.mock.calls.find(
      (c: unknown[]) => c[0] === "AUTH STEP google-user-create:fail",
    );
    expect(failCall).toBeTruthy();
    expect(String(failCall![1])).toContain("23502");
    expect(String(failCall![1])).toContain("name");
  });

  it("re-throws a failing linkAccount but logs the pg diagnostics first", async () => {
    const pgErr = Object.assign(new Error("duplicate key value"), { code: "23505" });
    const base = {
      getUserByAccount: vi.fn().mockResolvedValue(null),
      createUser: vi.fn(),
      linkAccount: vi.fn().mockRejectedValue(pgErr),
    };
    const wrapped = wrapAdapterWithDiagnostics(base as never);
    await expect(
      wrapped.linkAccount!({ provider: "google", providerAccountId: "123" } as never),
    ).rejects.toBe(pgErr);
    expect(steps()).toContain("AUTH STEP google-account-create:fail");
  });

  it("leaves adapter methods it does not know about untouched", () => {
    const base = { getSessionAndUser: vi.fn(), createUser: vi.fn() };
    const wrapped = wrapAdapterWithDiagnostics(base as never);
    expect(wrapped.getSessionAndUser).toBe(base.getSessionAndUser);
  });
});
