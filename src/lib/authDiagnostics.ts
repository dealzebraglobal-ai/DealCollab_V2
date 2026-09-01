/**
 * Auth.js (NextAuth v5) sign-in diagnostics — production-safe.
 *
 * WHY THIS EXISTS
 * A brand-new Google user hitting the OAuth callback was landing on
 *   /api/auth/error?error=Configuration
 * ("There is a problem with the server configuration").
 *
 * In Auth.js v5 that page is reached from the `catch` block of `Auth()`
 * (node_modules/@auth/core/index.js): any error thrown while handling the
 * OAuth callback that is **not** in the client-safe allow-list
 * (`isClientError`, node_modules/@auth/core/errors.js — CredentialsSignin,
 * OAuthAccountNotLinked, OAuthCallbackError, AccessDenied, Verification,
 * MissingCSRF, AccountNotLinked, WebAuthnVerificationError) is reported to the
 * browser as the generic `error=Configuration`. That bucket includes
 * `AdapterError` (thrown by the adapter's `createUser` / `linkAccount`),
 * `CallbackRouteError` (a throw inside the `jwt` callback or an `events`
 * handler) and `InvalidCheck` (missing/stale PKCE·state·nonce cookie).
 *
 * Existing users never execute `createUser` / `linkAccount` — Auth.js resolves
 * them via `getUserByAccount` first — so a failure isolated to the new-user
 * INSERT path is invisible until a genuinely new identity signs in.
 *
 * These helpers emit `AUTH STEP …` log lines and wrap the adapter so the
 * exact failing operation (and, for a Postgres error, its SQLSTATE / column /
 * constraint) shows up in the Vercel function logs — WITHOUT logging any
 * token, secret, cookie, JWT or raw PII.
 */

import type { Adapter } from "next-auth/adapters";

/** Redact an email to `a***@d***.tld` so logs can correlate without storing PII. */
export function maskEmail(email: unknown): string {
  if (typeof email !== "string" || !email.includes("@")) return "<none>";
  const [local, domainFull] = email.split("@");
  const dotParts = domainFull.split(".");
  const tld = dotParts.length > 1 ? dotParts.pop()! : "";
  const domain = dotParts.join(".");
  const head = (s: string) => (s ? s[0] + "***" : "***");
  return `${head(local)}@${head(domain)}${tld ? "." + tld : ""}`;
}

export interface AuthErrorInfo {
  errorClass: string;
  /** Postgres SQLSTATE, e.g. 22P02 (invalid text→uuid), 23502 (not-null), 23505 (unique), 42703 (undefined column). */
  code?: string;
  /** Postgres: offending column / constraint / table / schema — names only, never values. */
  column?: string;
  constraint?: string;
  table?: string;
  message: string;
}

/**
 * Describe a thrown error with only non-sensitive fields.
 * `pg` errors carry `code`/`column`/`constraint`/`table`; `detail` is
 * deliberately dropped because Postgres puts the offending row values there.
 */
export function describeAuthError(err: unknown): AuthErrorInfo {
  const e = err as Record<string, unknown> | null;
  const raw = e && typeof e === "object" && typeof e.message === "string" ? e.message : String(err);
  const info: AuthErrorInfo = {
    errorClass:
      (e && typeof e === "object" && e.constructor && (e.constructor as { name?: string }).name) ||
      "Error",
    message: raw.slice(0, 200),
  };
  if (e && typeof e === "object") {
    for (const k of ["code", "column", "constraint", "table"] as const) {
      const v = e[k];
      if (typeof v === "string" && v) info[k] = v;
    }
    // Auth.js AdapterError / CallbackRouteError nest the real cause.
    if (e.cause && e.cause !== e) {
      const inner = describeAuthError(e.cause);
      info.code ??= inner.code;
      info.column ??= inner.column;
      info.constraint ??= inner.constraint;
      info.table ??= inner.table;
      if (info.message === raw.slice(0, 200) && inner.message) {
        info.message = `${info.message} | cause: ${inner.message}`.slice(0, 300);
      }
    }
  }
  return info;
}

/** One structured breadcrumb. `extra` must already be free of secrets/PII. */
export function authStep(step: string, extra: Record<string, unknown> = {}): void {
  try {
    console.log(`AUTH STEP ${step}`, JSON.stringify(extra));
  } catch {
    console.log(`AUTH STEP ${step}`);
  }
}

/**
 * Wrap a NextAuth adapter so the new-user write path is traced. Behaviour is
 * unchanged — every method delegates to the base adapter and re-throws — only
 * logging is added.
 */
export function wrapAdapterWithDiagnostics(base: Adapter): Adapter {
  const wrapped: Adapter = { ...base };

  if (base.getUserByAccount) {
    wrapped.getUserByAccount = async (providerAccountId) => {
      const user = await base.getUserByAccount!(providerAccountId);
      authStep("google-user-lookup", {
        provider: providerAccountId.provider,
        existingUser: !!user,
      });
      return user;
    };
  }

  if (base.createUser) {
    wrapped.createUser = async (data) => {
      authStep("google-user-create:start", { email: maskEmail(data.email) });
      try {
        const user = await base.createUser!(data);
        authStep("google-user-create:ok", { userId: user.id });
        return user;
      } catch (err) {
        authStep("google-user-create:fail", { ...describeAuthError(err) });
        throw err;
      }
    };
  }

  if (base.linkAccount) {
    wrapped.linkAccount = async (account): Promise<void> => {
      authStep("google-account-create:start", { provider: account.provider });
      try {
        await base.linkAccount!(account);
        authStep("google-account-create:ok", { provider: account.provider });
      } catch (err) {
        authStep("google-account-create:fail", { ...describeAuthError(err) });
        throw err;
      }
    };
  }

  return wrapped;
}
