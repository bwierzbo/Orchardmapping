import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

type SessionCheck =
  | { userId: string; response?: undefined }
  | { userId?: undefined; response: NextResponse };

/**
 * Require a signed-in Clerk user for a mutating API route.
 * Returns either the userId or a ready-to-return 401 response.
 *
 * Access model: the Clerk instance is invite-only (managed in the Clerk
 * dashboard), so any signed-in user is a trusted collaborator.
 */
export async function requireSession(): Promise<SessionCheck> {
  const { userId } = await auth();
  if (!userId) {
    return {
      response: NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 }),
    };
  }
  return { userId };
}
