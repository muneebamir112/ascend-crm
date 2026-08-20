import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Uses the edge-safe config only (no Prisma/bcrypt) — see auth.config.ts.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/dashboard/:path*"],
};
