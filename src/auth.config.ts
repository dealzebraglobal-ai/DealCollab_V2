import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

// Notice: In Auth.js v5, environment variables like AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET
// are automatically picked up if they match these names. We explicitly pass them here
// for clarity and to ensure they are used.
export default {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // true: auto-linking Google login to an existing user with matching verified email
      // allows seamless login for users created through email OTP, IB/mediator onboarding, or phone.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
