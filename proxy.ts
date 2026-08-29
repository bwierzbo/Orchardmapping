import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

/**
 * Coarse page-level auth gate. API routes each enforce auth and roles in
 * their handlers; this proxy only covers the paths in the matcher below,
 * so tile/blob/static traffic never pays for a session decode.
 */
export const proxy = auth((request) => {
  const { pathname } = request.nextUrl;
  const isAuthenticated = !!request.auth;

  if (!isAuthenticated && pathname !== '/login') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/login' && isAuthenticated) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/orchards/new/:path*',
    '/api/orchards/create',
    '/api/users/:path*',
    '/login',
  ],
};
