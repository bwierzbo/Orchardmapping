import type { NextAuthConfig } from 'next-auth';
import type { UserRole } from './lib/db/users';

/**
 * Edge-safe NextAuth config shared by auth.ts and proxy.ts.
 *
 * No providers here: the Credentials provider pulls in bcryptjs and
 * @vercel/postgres, which must not load in the proxy runtime. The proxy
 * only needs to decode the session JWT, which this config suffices for.
 */
export const authConfig = {
  providers: [],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days (JWT-only sessions; no revocation)
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // JWT claims are Record<string, unknown>; shapes are set in jwt() above
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
