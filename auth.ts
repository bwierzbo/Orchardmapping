import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

// Admin users configuration
// WARNING: Never hardcode passwords! Always use environment variables.
const ADMIN_USERS = [
  {
    id: '1',
    username: process.env.ADMIN_USERNAME || 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@orchard.local',
    password: process.env.ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME || 'Admin',
  },
].filter(user => user.password); // Only include users with passwords set

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const username = credentials?.username as string;
        const password = credentials?.password as string;

        if (!username || !password) {
          return null;
        }

        // Check against admin users (by username or email)
        const user = ADMIN_USERS.find(
          (u) =>
            (u.username === username || u.email === username) &&
            u.password === password
        );

        if (user) {
          // Return user object without password
          return {
            id: user.id,
            name: user.name,
            email: user.email,
          };
        }

        // Invalid credentials
        return null;
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
