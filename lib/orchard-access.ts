import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { sql } from '@vercel/postgres';
import { roleAtLeast, type OrchardRole } from './roles';

export { ORCHARD_ROLES, roleAtLeast, ROLE_LABEL, ROLE_DESCRIPTION } from './roles';
export type { OrchardRole } from './roles';

/**
 * Turn a pending invitation into a membership.
 *
 * Invitations are keyed by email because a Clerk user id does not exist
 * until the person signs in for the first time. This runs on the access
 * miss path -- the first time an invited person asks for an orchard they
 * are not yet a member of -- so there is no webhook to go wrong and no
 * periodic job to forget.
 */
async function claimInvitations(userId: string): Promise<void> {
  const user = await currentUser();
  const emails = (user?.emailAddresses ?? [])
    .map((e) => e.emailAddress?.toLowerCase())
    .filter((e): e is string => !!e);
  if (emails.length === 0) return;

  // Parameterised array: the tagged template only takes primitives.
  const { rows } = await sql.query(
    `SELECT id, orchard_id, role FROM orchard_invitations
     WHERE lower(email) = ANY($1::text[])
       AND accepted_at IS NULL AND revoked_at IS NULL`,
    [emails]
  );
  for (const inv of rows) {
    // An existing membership wins: re-accepting an old invitation must not
    // quietly change someone's role.
    await sql`
      INSERT INTO orchard_members (orchard_id, user_id, role)
      VALUES (${String(inv.orchard_id)}, ${userId}, ${String(inv.role)})
      ON CONFLICT (orchard_id, user_id) DO NOTHING
    `;
    await sql`
      UPDATE orchard_invitations
      SET accepted_at = NOW(), accepted_by = ${userId}
      WHERE id = ${Number(inv.id)}
    `;
  }
}

/**
 * This user's role on this orchard, or null if they have none.
 * Checks pending invitations before concluding no.
 */
export async function orchardRole(
  orchardId: string,
  userId: string
): Promise<OrchardRole | null> {
  const read = async () => {
    const { rows } = await sql`
      SELECT role FROM orchard_members
      WHERE orchard_id = ${orchardId} AND user_id = ${userId}
    `;
    return rows.length > 0 ? (String(rows[0].role) as OrchardRole) : null;
  };
  const found = await read();
  if (found) return found;
  await claimInvitations(userId);
  return read();
}

/**
 * The signed-in viewer's role on this orchard, for pages.
 * Returns null for signed-out visitors and for non-members alike --
 * a page should render the same "no such orchard" either way rather than
 * confirming that someone else's orchard exists.
 */
export async function viewerRole(orchardId: string): Promise<OrchardRole | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return orchardRole(orchardId, userId);
}

type AccessCheck =
  | { userId: string; role: OrchardRole; response?: undefined }
  | { userId?: undefined; role?: undefined; response: NextResponse };

/**
 * Require a signed-in member of this orchard, at or above `required`.
 *
 * Replaces bare requireSession() on every route that takes an orchard id.
 * requireSession only asked "is anyone signed in", which was the whole
 * problem: the orchard id arrives from the URL, so any signed-in user
 * could name any orchard.
 *
 * A non-member gets 404, not 403. 403 confirms the orchard exists.
 */
export async function requireOrchardAccess(
  orchardId: string,
  required: OrchardRole = 'operator'
): Promise<AccessCheck> {
  const { userId } = await auth();
  if (!userId) {
    return {
      response: NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 }),
    };
  }
  const role = await orchardRole(orchardId, userId);
  if (!role) {
    return { response: NextResponse.json({ error: 'Orchard not found.' }, { status: 404 }) };
  }
  if (!roleAtLeast(role, required)) {
    return {
      response: NextResponse.json(
        { error: `This needs ${required} access. You have ${role}.` },
        { status: 403 }
      ),
    };
  }
  return { userId, role };
}

/** Orchards this user belongs to, for the home page and orchard switcher. */
export async function memberOrchardIds(userId: string): Promise<string[]> {
  await claimInvitations(userId);
  const { rows } = await sql`
    SELECT orchard_id FROM orchard_members WHERE user_id = ${userId}
  `;
  return rows.map((r) => String(r.orchard_id));
}

/**
 * Assert access for a route that has already established `userId`.
 * Returns a response to return, or null to carry on.
 *
 * The two-call shape (requireSession then this) is deliberate on mutating
 * routes: the orchard id usually arrives in the body, so a signed-out
 * caller should get 401 before the body is parsed rather than a confusing
 * 400 about a missing field.
 */
export async function assertOrchardAccess(
  orchardId: string,
  userId: string,
  required: OrchardRole = 'operator'
): Promise<NextResponse | null> {
  const role = await orchardRole(orchardId, userId);
  if (!role) return NextResponse.json({ error: 'Orchard not found.' }, { status: 404 });
  if (!roleAtLeast(role, required)) {
    return NextResponse.json(
      { error: `This needs ${required} access. You have ${role}.` },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Assert access to the orchard a tree belongs to.
 *
 * Tree routes are keyed by tree id, so the orchard has to be resolved
 * before it can be checked -- otherwise the id in the URL is again the
 * only thing deciding what you may touch.
 */
export async function assertTreeAccess(
  treeId: string,
  userId: string,
  required: OrchardRole = 'operator'
): Promise<NextResponse | null> {
  const { rows } = await sql`
    SELECT orchard_id FROM trees WHERE tree_id = ${treeId} LIMIT 1
  `;
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Tree not found.' }, { status: 404 });
  }
  return assertOrchardAccess(String(rows[0].orchard_id), userId, required);
}

/**
 * Tree access for a route that has not established a user yet.
 * Signs the caller in first, so a signed-out request gets 401 rather
 * than the 404 a non-member sees.
 */
export async function requireTreeAccess(
  treeId: string,
  required: OrchardRole = 'operator'
): Promise<NextResponse | null> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
  }
  return assertTreeAccess(treeId, userId, required);
}
