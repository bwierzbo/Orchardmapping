import { sql } from '@vercel/postgres';
import { clerkClient } from '@clerk/nextjs/server';
import type { OrchardRole } from '@/lib/orchard-access';

export interface OrchardMember {
  userId: string;
  role: OrchardRole;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
  createdAt: string;
}

export interface PendingInvitation {
  id: number;
  email: string;
  role: OrchardRole;
  invitedBy: string;
  createdAt: string;
}

/**
 * Members of an orchard, with their names filled in from Clerk.
 *
 * Only the Clerk user id lives in our database — names and emails stay in
 * Clerk so there is one copy to keep correct. If Clerk is unreachable the
 * list still renders, just with ids instead of names.
 */
export async function listMembers(orchardId: string): Promise<OrchardMember[]> {
  const { rows } = await sql`
    SELECT user_id, role, created_at FROM orchard_members
    WHERE orchard_id = ${orchardId}
    ORDER BY created_at
  `;
  if (rows.length === 0) return [];

  const profiles = new Map<string, { name: string | null; email: string | null; imageUrl: string | null }>();
  try {
    const client = await clerkClient();
    const list = await client.users.getUserList({
      userId: rows.map((r) => String(r.user_id)),
      limit: 100,
    });
    for (const u of list.data) {
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || null;
      profiles.set(u.id, {
        name,
        email: u.primaryEmailAddress?.emailAddress ?? null,
        imageUrl: u.imageUrl ?? null,
      });
    }
  } catch {
    // Clerk unreachable: fall through with ids only.
  }

  return rows.map((r) => {
    const p = profiles.get(String(r.user_id));
    return {
      userId: String(r.user_id),
      role: String(r.role) as OrchardRole,
      name: p?.name ?? null,
      email: p?.email ?? null,
      imageUrl: p?.imageUrl ?? null,
      createdAt: new Date(String(r.created_at)).toISOString(),
    };
  });
}

export async function listPendingInvitations(orchardId: string): Promise<PendingInvitation[]> {
  const { rows } = await sql`
    SELECT id, email, role, invited_by, created_at FROM orchard_invitations
    WHERE orchard_id = ${orchardId} AND accepted_at IS NULL AND revoked_at IS NULL
    ORDER BY created_at DESC
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    email: String(r.email),
    role: String(r.role) as OrchardRole,
    invitedBy: String(r.invited_by),
    createdAt: new Date(String(r.created_at)).toISOString(),
  }));
}

export interface InviteResult {
  invitationId: number;
  /** Whether Clerk sent a sign-up email, or the admin must share the link. */
  emailSent: boolean;
  note?: string;
}

/**
 * Invite someone to an orchard by email.
 *
 * Two records, because they answer different questions. The Clerk
 * invitation lets the person create an account on an invite-only
 * instance; our row says which orchard and role they get once they do.
 * If they already have an account, only our row is needed — Clerk
 * rejects a duplicate invitation, which is not an error here.
 */
export async function inviteMember(
  orchardId: string,
  email: string,
  role: OrchardRole,
  invitedBy: string
): Promise<InviteResult> {
  const normalized = email.trim().toLowerCase();

  const { rows } = await sql`
    INSERT INTO orchard_invitations (orchard_id, email, role, invited_by)
    VALUES (${orchardId}, ${normalized}, ${role}, ${invitedBy})
    ON CONFLICT (orchard_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL
    DO UPDATE SET role = EXCLUDED.role, invited_by = EXCLUDED.invited_by, created_at = NOW()
    RETURNING id
  `;
  const invitationId = Number(rows[0].id);

  try {
    const client = await clerkClient();
    const existing = await client.users.getUserList({ emailAddress: [normalized], limit: 1 });
    if (existing.data.length > 0) {
      return {
        invitationId,
        emailSent: false,
        note: 'They already have an account — it will appear next time they sign in.',
      };
    }
    await client.invitations.createInvitation({
      emailAddress: normalized,
      ignoreExisting: true,
    });
    return { invitationId, emailSent: true };
  } catch (e) {
    return {
      invitationId,
      emailSent: false,
      note: `Saved, but no sign-up email went out (${
        e instanceof Error ? e.message : 'Clerk unavailable'
      }). Invite them from the Clerk dashboard.`,
    };
  }
}

export async function revokeInvitation(orchardId: string, id: number): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE orchard_invitations SET revoked_at = NOW()
    WHERE id = ${id} AND orchard_id = ${orchardId} AND accepted_at IS NULL AND revoked_at IS NULL
  `;
  return (rowCount ?? 0) > 0;
}

/**
 * Change a member's role.
 *
 * Refuses to remove the last admin: an orchard with no admin cannot
 * invite anyone or change its own settings, and nothing in the app can
 * recover from that.
 */
export async function setMemberRole(
  orchardId: string,
  userId: string,
  role: OrchardRole
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (role !== 'admin' && (await isLastAdmin(orchardId, userId))) {
    return { ok: false, reason: 'This is the only admin. Make someone else an admin first.' };
  }
  const { rowCount } = await sql`
    UPDATE orchard_members SET role = ${role}
    WHERE orchard_id = ${orchardId} AND user_id = ${userId}
  `;
  return (rowCount ?? 0) > 0 ? { ok: true } : { ok: false, reason: 'Not a member of this orchard.' };
}

export async function removeMember(
  orchardId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (await isLastAdmin(orchardId, userId)) {
    return { ok: false, reason: 'This is the only admin. Make someone else an admin first.' };
  }
  const { rowCount } = await sql`
    DELETE FROM orchard_members WHERE orchard_id = ${orchardId} AND user_id = ${userId}
  `;
  return (rowCount ?? 0) > 0 ? { ok: true } : { ok: false, reason: 'Not a member of this orchard.' };
}

async function isLastAdmin(orchardId: string, userId: string): Promise<boolean> {
  const { rows } = await sql`
    SELECT user_id FROM orchard_members
    WHERE orchard_id = ${orchardId} AND role = 'admin'
  `;
  return rows.length === 1 && String(rows[0].user_id) === userId;
}
