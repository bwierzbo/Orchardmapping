import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import type { UserRole } from './db/users';

/** Roles allowed to create/update/delete data. Viewers are read-only. */
export const WRITER_ROLES: readonly UserRole[] = ['admin', 'operator'];

type SessionCheck =
  | { session: Session; response?: undefined }
  | { session?: undefined; response: NextResponse };

/**
 * Require an authenticated session, optionally restricted to roles.
 * Returns either the session or a ready-to-return 401/403 response.
 */
export async function requireSession(roles?: readonly UserRole[]): Promise<SessionCheck> {
  const session = await auth();
  if (!session?.user) {
    return {
      response: NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 }),
    };
  }
  if (roles && !roles.includes(session.user.role)) {
    return {
      response: NextResponse.json({ error: 'Forbidden. Insufficient role.' }, { status: 403 }),
    };
  }
  return { session };
}
