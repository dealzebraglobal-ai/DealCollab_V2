import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import { db } from "./db";
import { accounts, sessions, users, verificationTokens } from "./db/schema";
import { authStep, describeAuthError, maskEmail, wrapAdapterWithDiagnostics } from "./lib/authDiagnostics";

// Config-presence check only (booleans, never the secret values themselves) —
// kept to dev/preview so it doesn't add noise to production logs.
if (process.env.NODE_ENV !== "production") {
  console.log("Auth Configuration Check:", {
    hasSecret: !!(process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET),
    hasGoogleId: !!process.env.GOOGLE_CLIENT_ID,
    hasGoogleSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    authUrl: process.env.AUTH_URL ? "Set" : "Not Set (Inferred)",
    trustHost: process.env.AUTH_TRUST_HOST || "Not Set",
  });
}

import { eq } from "drizzle-orm";

const adapter = wrapAdapterWithDiagnostics(
  DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  basePath: "/api/auth",
  ...authConfig,
  trustHost: true,
  // NextAuth's debug mode logs full auth flow metadata (tokens, session
  // internals) — appropriate for diagnosing a dev/preview issue, but a
  // production information-disclosure risk if left on indefinitely.
  debug: process.env.NODE_ENV !== "production",
  logger: {
    error(error) {
      console.error("NEXTAUTH ERROR:", error);
    },
    warn(code) {
      console.warn("NEXTAUTH WARN:", code);
    },
    debug(code, metadata) {
      if (process.env.NODE_ENV !== "production") {
        console.log("NEXTAUTH DEBUG:", code, metadata);
      }
    },
  },
  providers: [
    ...authConfig.providers,
    Credentials({
      id: "credentials",
      name: "Phone OTP",
      credentials: {
        phone: { label: "Phone", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.phone) return null;

        // Find the user by verified phone number
        const user = await db.query.users.findFirst({
          where: eq(users.phone, credentials.phone as string),
        });

        if (user && user.isPhoneVerified) {
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            isPhoneVerified: user.isPhoneVerified,
          };
        }
        return null;
      },
    }),
    Credentials({
      id: "email-otp",
      name: "Email OTP",
      credentials: {
        email: { label: "Email", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, credentials.email as string),
        });

        if (user && user.emailVerified) {
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            isPhoneVerified: user.isPhoneVerified,
          };
        }
        return null;
      },
    }),
  ],
  // JWT, not database, sessions — required because this app's primary
  // sign-in methods (email-otp and phone Credentials providers below) use
  // Auth.js's Credentials provider, which cannot create a persisted
  // database session row (documented Auth.js limitation: Credentials
  // logins always issue a JWT regardless of the configured strategy). Under
  // "database" strategy, the very next real session lookup against the
  // `sessions` table finds nothing for a Credentials-issued JWT cookie, so
  // useSession() flips to 'unauthenticated' shortly after a successful
  // login — this was the root cause of users landing on /home then
  // immediately bouncing back to "/" (auth.config.ts's pages.signIn).
  // Google OAuth (auth.config.ts) is unaffected: DrizzleAdapter still
  // manages the users/accounts tables for account linkage under JWT
  // strategy, it just stops writing to the sessions table. The jwt/session
  // callbacks below already fully populate token.*/session.user for the
  // "token" branch — they were written for JWT strategy, not "database".
  session: { strategy: "jwt" },
  // Events run AFTER the adapter has persisted the user/account, so `user.id`
  // here is the real `users.id` UUID for both new and existing sign-ins. This
  // is the safe place for post-sign-in writes (last-login stamp, WhatsApp
  // phone link). Every handler is fully guarded: a throw from an event is
  // wrapped by Auth.js as CallbackRouteError → `error=Configuration`.
  events: {
    async createUser({ user }) {
      authStep("google-user-create:event", { userId: user.id });
    },
    async linkAccount({ account }) {
      authStep("google-account-create:event", { provider: account.provider });
    },
    async signIn({ user, isNewUser }) {
      if (!user.id) return;
      const userId = user.id;
      authStep("session-create", { userId, isNewUser: !!isNewUser });

      // Last-login stamp (keyed on the real UUID).
      try {
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
      } catch (err) {
        authStep("last-login-stamp:fail", { ...describeAuthError(err) });
      }

      // WhatsApp phone link — deferred from the signIn callback so the row exists.
      try {
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        const whatsappPhone = cookieStore.get("whatsapp_phone")?.value;
        if (whatsappPhone) {
          const existingUserWithPhone = await db.query.users.findFirst({
            where: eq(users.phone, whatsappPhone),
          });
          if (existingUserWithPhone && existingUserWithPhone.id !== userId) {
            if (existingUserWithPhone.email?.endsWith("@dealcollab.ai")) {
              await db.delete(users).where(eq(users.id, existingUserWithPhone.id));
            } else {
              // Real conflict — leave the other account untouched, don't steal the phone.
              authStep("whatsapp-link:conflict", { userId: userId });
              cookieStore.delete("whatsapp_phone");
              return;
            }
          }
          await db
            .update(users)
            .set({ phone: whatsappPhone, isPhoneVerified: true })
            .where(eq(users.id, userId));
          cookieStore.delete("whatsapp_phone");
          authStep("whatsapp-link:ok", { userId: userId });
        }
      } catch (err) {
        authStep("whatsapp-link:fail", { ...describeAuthError(err) });
      }

      authStep("auth-complete", { userId: userId, isNewUser: !!isNewUser });
    },
  },
  callbacks: {
    // @ts-expect-error - callbacks might not be present in authConfig
    ...authConfig.callbacks,
    // NOTE: For a brand-new OAuth user this callback runs BEFORE the adapter
    // has created the row (Auth.js order: signIn callback → handleLoginOrRegister),
    // and the `user` argument is the raw provider profile — `user.id` is
    // Google's `sub`, NOT our `users.id` UUID. Using it in a
    // `where(eq(users.id, user.id))` throws Postgres 22P02
    // ("invalid input syntax for type uuid"), which Auth.js surfaces to the
    // browser as `error=Configuration`. So: identify by EMAIL here, never by
    // `user.id`, keep every branch inside its own try/catch (a throw from
    // this callback becomes AccessDenied / Configuration), and defer all
    // writes that need the real UUID to `events.signIn` below.
    async signIn({ user, account }) {
      authStep("google-callback:start", {
        provider: account?.provider ?? "unknown",
        email: maskEmail(user?.email),
      });

      const email = typeof user?.email === "string" ? user.email : null;
      if (!email) return true;

      // Hard-conflict check only (read-only). The actual phone link happens in
      // events.signIn once the user row (and its UUID) exists.
      try {
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        const whatsappPhone = cookieStore.get("whatsapp_phone")?.value;
        if (whatsappPhone) {
          const existingUserWithPhone = await db.query.users.findFirst({
            where: eq(users.phone, whatsappPhone),
          });
          const isPlaceholder = existingUserWithPhone?.email?.endsWith("@dealcollab.ai");
          const isSamePerson = existingUserWithPhone?.email === email;
          if (existingUserWithPhone && !isPlaceholder && !isSamePerson) {
            authStep("google-callback:phone-conflict", { email: maskEmail(email) });
            // DO NOT return a string here — it causes a redirect loop in App Router.
            return false;
          }
        }
      } catch (err) {
        // A failure here must not block sign-in.
        authStep("google-callback:conflict-check:fail", { ...describeAuthError(err) });
      }

      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        // @ts-expect-error - isPhoneVerified is a custom property added via callbacks
        token.isPhoneVerified = user.isPhoneVerified === true || String(user.isPhoneVerified) === 'true';
        // @ts-expect-error - phone is a custom property added via callbacks
        token.phone = user.phone;
        // @ts-expect-error - tokens is a custom property added via callbacks
        token.tokens = user.tokens || 0;
        // @ts-expect-error - profileCompletion is a custom property added via callbacks
        token.profileCompletion = user.profileCompletion || 0;
      }

      // Sync DB → JWT: on explicit update() call OR when phone hasn't been loaded yet
      if (trigger === "update" || token.phone === undefined || token.phone === null) {
        try {
          const dbUser = await db.query.users.findFirst({
            where: eq(users.id, token.id as string),
          });
          if (dbUser) {
            token.isPhoneVerified = dbUser.isPhoneVerified === true || String(dbUser.isPhoneVerified) === 'true';
            token.phone = dbUser.phone ?? null;
            token.tokens = dbUser.tokens || 0;
            token.profileCompletion = dbUser.profileCompletion || 0;
          }
        } catch (error: unknown) {
          console.error("FULL ERROR:", error);
          console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
          // Return existing token — do NOT throw, keeps user logged in
        }
      }

      return token;
    },
    async session({ session, token, user }) {
      if (session.user) {
        // In database strategy, 'user' is passed. In jwt strategy, 'token' is passed.
        if (user) {
          session.user.id = user.id;
          // @ts-expect-error - Custom properties on user object from database
          session.user.isPhoneVerified = user.isPhoneVerified;
          // @ts-expect-error - Custom properties on user object from database
          session.user.phone = user.phone;
          // @ts-expect-error - Custom properties on user object from database
          session.user.tokens = user.tokens;
          // @ts-expect-error - Custom properties on user object from database
          session.user.profileCompletion = user.profileCompletion;
        } else if (token) {
          session.user.id = token.id as string;
          // @ts-expect-error - isPhoneVerified is added to session user via JWT token
          session.user.isPhoneVerified = token.isPhoneVerified;
          // @ts-expect-error - phone is added to session user via JWT token
          session.user.phone = token.phone;
          // @ts-expect-error - tokens is added to session user via JWT token
          session.user.tokens = token.tokens;
          // @ts-expect-error - profileCompletion is added to session user via JWT token
          session.user.profileCompletion = token.profileCompletion;
        }
      }
      return session;
    },
  },
});
