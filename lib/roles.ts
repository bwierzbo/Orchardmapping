/**
 * Role vocabulary, with no server imports.
 *
 * Kept apart from lib/orchard-access.ts because client components need
 * the names and the ranking, and importing them from the access module
 * would drag Clerk's server SDK and the database client into the browser
 * bundle — which fails the build rather than failing quietly.
 *
 * Matches CiderPilot's user_role enum so the two apps read the same.
 */
export const ORCHARD_ROLES = ['viewer', 'operator', 'admin'] as const;
export type OrchardRole = (typeof ORCHARD_ROLES)[number];

/** Higher outranks lower. The array order above IS the ranking. */
const RANK: Record<OrchardRole, number> = { viewer: 1, operator: 2, admin: 3 };

export function roleAtLeast(role: OrchardRole, required: OrchardRole): boolean {
  return RANK[role] >= RANK[required];
}

export const ROLE_LABEL: Record<OrchardRole, string> = {
  admin: 'Admin',
  operator: 'Operator',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTION: Record<OrchardRole, string> = {
  admin: 'Change settings, invite people, delete the orchard',
  operator: 'Record walks, sprays, harvests and observations',
  viewer: 'See everything, change nothing',
};
