import { sql } from '@vercel/postgres';
import { clerkClient } from '@clerk/nextjs/server';
import type { OrchardRole } from '../roles';

/**
 * Everyone in the system, for the global access console.
 *
 * Only Clerk user ids live in our database — names and emails stay in
 * Clerk so there is one copy to keep correct. People who have signed up
 * but hold no access at all still appear here, because "who is waiting to
 * be let in" is exactly what this screen is for.
 */
export interface Person {
  userId: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
  /** Level across every orchard, or null for almost everyone. */
  globalRole: OrchardRole | null;
  /** Explicit memberships, which may raise them above their global level. */
  memberships: Array<{ orchardId: string; orchardName: string; role: OrchardRole }>;
  lastSignInAt: string | null;
}

export async function listPeople(): Promise<Person[]> {
  const [globals, memberships] = await Promise.all([
    sql`SELECT user_id, role FROM global_members`,
    sql`
      SELECT m.user_id, m.orchard_id, m.role, o.name AS orchard_name
      FROM orchard_members m
      JOIN orchards o ON o.id = m.orchard_id
      ORDER BY o.name
    `,
  ]);

  const globalByUser = new Map(globals.rows.map((r) => [String(r.user_id), String(r.role) as OrchardRole]));
  const membershipsByUser = new Map<string, Person['memberships']>();
  for (const r of memberships.rows) {
    const id = String(r.user_id);
    membershipsByUser.set(id, [
      ...(membershipsByUser.get(id) ?? []),
      {
        orchardId: String(r.orchard_id),
        orchardName: String(r.orchard_name),
        role: String(r.role) as OrchardRole,
      },
    ]);
  }

  let clerkUsers: Array<{
    id: string;
    name: string | null;
    email: string | null;
    imageUrl: string | null;
    lastSignInAt: string | null;
  }> = [];
  try {
    const client = await clerkClient();
    const list = await client.users.getUserList({ limit: 200 });
    clerkUsers = list.data.map((u) => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || null,
      email: u.primaryEmailAddress?.emailAddress ?? null,
      imageUrl: u.imageUrl ?? null,
      lastSignInAt: u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : null,
    }));
  } catch {
    // Clerk unreachable: fall back to whoever our own tables know about,
    // so the console still lists access even without names against it.
    const ids = new Set([...globalByUser.keys(), ...membershipsByUser.keys()]);
    clerkUsers = [...ids].map((id) => ({
      id,
      name: null,
      email: null,
      imageUrl: null,
      lastSignInAt: null,
    }));
  }

  return clerkUsers
    .map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      imageUrl: u.imageUrl,
      globalRole: globalByUser.get(u.id) ?? null,
      memberships: membershipsByUser.get(u.id) ?? [],
      lastSignInAt: u.lastSignInAt,
    }))
    .sort((a, b) => {
      // People with the most reach first, then anyone with any access,
      // then the people waiting to be let in.
      const rank = (p: Person) => (p.globalRole ? 0 : p.memberships.length > 0 ? 1 : 2);
      return rank(a) - rank(b) || (a.name ?? a.email ?? '').localeCompare(b.name ?? b.email ?? '');
    });
}

/**
 * Grant or clear someone's system-wide level.
 *
 * Passing null removes it, which leaves whatever explicit memberships
 * they hold — so clearing a global admin does not necessarily lock them
 * out, and the console shows what is left.
 */
export async function setGlobalRole(
  userId: string,
  role: OrchardRole | null,
  grantedBy: string
): Promise<void> {
  // Never let the last global admin be removed or demoted: nobody would
  // be left who could grant the level back. The invariant lives here
  // rather than in the route so no other caller can step around it.
  if (role !== 'admin') {
    const { rows } = await sql`
      SELECT
        (SELECT role FROM global_members WHERE user_id = ${userId}) AS current,
        (SELECT count(*)::int FROM global_members WHERE role = 'admin') AS admins
    `;
    if (String(rows[0]?.current) === 'admin' && Number(rows[0]?.admins) <= 1) {
      throw Object.assign(
        new Error(
          'This is the last global admin. Give someone else the level first, or nobody could grant it back.'
        ),
        { status: 400 }
      );
    }
  }

  if (role === null) {
    await sql`DELETE FROM global_members WHERE user_id = ${userId}`;
    return;
  }
  await sql`
    INSERT INTO global_members (user_id, role, granted_by)
    VALUES (${userId}, ${role}, ${grantedBy})
    ON CONFLICT (user_id) DO UPDATE SET role = ${role}, granted_by = ${grantedBy}
  `;
}
