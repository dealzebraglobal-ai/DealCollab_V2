import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import { db } from "./db";
import { accounts, sessions, users, verificationTokens } from "./db/schema";

// Debug logging for Production/Vercel (Masked)
if (process.env.NODE_ENV === "production") {
  console.log("Auth Configuration Check:", {
    hasSecret: !!(process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET),
    hasGoogleId: !!process.env.GOOGLE_CLIENT_ID,
    hasGoogleSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    authUrl: process.env.AUTH_URL ? "Set" : "Not Set (Inferred)",
    trustHost: process.env.AUTH_TRUST_HOST || "Not Set",
  });
}

import { eq } from "drizzle-orm";

const adapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  basePath: "/api/auth",
  ...authConfig,
  trustHost: true,
  debug: true, // Enabled for production debugging
  logger: {
    error(error) {
      console.error("NEXTAUTH ERROR:", error);
    },
    warn(code) {
      console.warn("NEXTAUTH WARN:", code);
    },
    debug(code, metadata) {
      console.log("NEXTAUTH DEBUG:", code, metadata);
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
  session: { strategy: "database" },
  callbacks: {
    // @ts-expect-error - callbacks might not be present in authConfig
    ...authConfig.callbacks,
    async signIn({ user }) {
      console.log("SIGNIN FLOW:", { userId: user.id, userEmail: user.email });
      if (!user.id) return true;

      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const whatsappPhone = cookieStore.get("whatsapp_phone")?.value;
      console.log("SIGNIN WHATSAPP CHECK:", { whatsappPhone });

      if (whatsappPhone) {
        const existingUserWithPhone = await db.query.users.findFirst({
          where: eq(users.phone, whatsappPhone),
        });

        // Case: User logs in with an EXISTING Google account, but we have a WhatsApp phone to link
        if (existingUserWithPhone && existingUserWithPhone.id !== user.id) {
          // If the conflict is with a placeholder, delete the placeholder and take the phone
          if (existingUserWithPhone.email?.endsWith('@dealcollab.ai')) {
            console.log("SIGNIN: Deleting placeholder user", existingUserWithPhone.id);
            await db.delete(users).where(eq(users.id, existingUserWithPhone.id));
          } else {
            // Actual conflict with another real user
            console.warn("SIGNIN CONFLICT: Phone already linked to another user", { 
              whatsappPhone, 
              existingUserId: existingUserWithPhone.id,
              currentUserId: user.id
            });
            // DO NOT return a string here as it causes a redirect loop in App Router
            return false; 
          }
        }

        // Link the phone to this real Google user
        console.log("SIGNIN: Linking phone to user", { userId: user.id, phone: whatsappPhone });
        await db.update(users)
          .set({
            phone: whatsappPhone,
            isPhoneVerified: true
          })
          .where(eq(users.id, user.id));

        cookieStore.delete("whatsapp_phone");
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
