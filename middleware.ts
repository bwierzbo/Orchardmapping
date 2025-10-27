import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth;

  // Protected routes
  const protectedPaths = [
    '/orchards/new',
    '/api/orchards',
  ];

  // Check if the current path matches any protected path
  const isProtectedRoute = protectedPaths.some(path => pathname.startsWith(path));

  // Redirect to login if trying to access protected route while not authenticated
  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to home if trying to access login while authenticated
  if (pathname === '/login' && isAuthenticated) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
