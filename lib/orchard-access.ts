import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { sql } from '@vercel/postgres';
import { getAllOrchardConfigs } from './db/orchards';
import type { OrchardConfig } from './types';
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
 * A level that applies to every orchard, or null for almost everybody.
 * See migration 051.
 */
export async function globalRole(userId: string): Promise<OrchardRole | null> {
  const { rows } = await sql`
    SELECT role FROM global_members WHERE user_id = ${userId}
  `;
  return rows.length > 0 ? (String(rows[0].role) as OrchardRole) : null;
}

/** True for the handful of people who run the whole system. */
export async function isGlobalAdmin(userId: string): Promise<boolean> {
  return (await globalRole(userId)) === 'admin';
}

/**
 * This user's role on this orchard, or null if they have none.
 *
 * The higher of their membership and their global level: per-orchard can
 * raise someone above their global level but never lower them, so an
 * orchard's owner cannot lock out the people who support the system.
 * Checks pending invitations before concluding no.
 */
export async function orchardRole(
  orchardId: string,
  userId: string
): Promise<OrchardRole | null> {
  const readMembership = async () => {
    const { rows } = await sql`
      SELECT role FROM orchard_members
      WHERE orchard_id = ${orchardId} AND user_id = ${userId}
    `;
    return rows.length > 0 ? (String(rows[0].role) as OrchardRole) : null;
  };

  const [global, membership] = await Promise.all([globalRole(userId), readMembership()]);
  if (membership) return higherRole(global, membership);
  if (global) return global;

  // No membership and no global level: an invitation may be waiting.
  await claimInvitations(userId);
  return readMembership();
}

/** Whichever of two levels grants more; null means "no level at all". */
function higherRole(a: OrchardRole | null, b: OrchardRole | null): OrchardRole | null {
  if (!a) return b;
  if (!b) return a;
  return roleAtLeast(a, b) ? a : b;
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
  // A global level reaches every orchard, including ones created after it
  // was granted — which is the point of it.
  if (await globalRole(userId)) {
    const { rows } = await sql`SELECT id FROM orchards`;
    return rows.map((r) => String(r.id));
  }
  await claimInvitations(userId);
  const { rows } = await sql`
    SELECT orchard_id FROM orchard_members WHERE user_id = ${userId}
  `;
  return rows.map((r) => String(r.orchard_id));
}

/**
 * The orchards this user belongs to, as full configs.
 *
 * Anything that shows a person a *list* of orchards goes through here --
 * the home page, the switcher in the dashboard header, the config API.
 * Fetching every orchard and filtering at the call site is how the
 * switcher ended up naming other growers' orchards to anyone signed in.
 */
export async function memberOrchardConfigs(userId: string): Promise<OrchardConfig[]> {
  const [mine, all] = await Promise.all([
    memberOrchardIds(userId),
    getAllOrchardConfigs(),
  ]);
  const mineSet = new Set(mine);
  return all.filter((o) => mineSet.has(o.id));
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
