import { auth } from '@/auth';
import { NextResponse, NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get session
  const session = await auth();
  const isAuthenticated = !!session;

  // Protected routes (require authentication)
  const protectedPaths = [
    '/orchards/new',
    '/api/orchards/create',  // Only protect create, not config
    '/api/users',
  ];

  // Check if the current path matches any protected path
  const isProtectedRoute = protectedPaths.some(path => pathname.startsWith(path));

  // Redirect to login if trying to access protected route while not authenticated
  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to home if trying to access login while authenticated
  if (pathname === '/login' && isAuthenticated) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
