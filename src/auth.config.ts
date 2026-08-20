import type { NextAuthConfig } from "next-auth";

// Edge-safe auth config used by middleware.ts. Deliberately has NO providers
// here — the Credentials provider needs Prisma + bcrypt, which don't run in
// the Edge runtime middleware executes in. Providers are added on top of
// this in src/auth.ts, which route handlers use in the Node.js runtime.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isDashboard = nextUrl.pathname.startsWith("/dashboard");
      if (isDashboard) return isLoggedIn;
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
