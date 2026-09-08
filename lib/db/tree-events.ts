import { sql } from '@vercel/postgres';

/** Automatic event types, written by the API when tree data changes. */
export const AUTO_EVENT_TYPES = [
  'created',
  'updated',
  'status_change',
  'moved',
  'deleted',
] as const;

/** Manual field-activity types a user can log from the tree panel. */
export const MANUAL_EVENT_TYPES = [
  'pruning',
  'spray',
  'fertilize',
  'observation',
  'harvest',
  'note',
] as const;

export type TreeEventType =
  | (typeof AUTO_EVENT_TYPES)[number]
  | (typeof MANUAL_EVENT_TYPES)[number];

export interface TreeEvent {
  id: number;
  tree_id: string;
  orchard_id: string;
  event_type: TreeEventType;
  event_date: Date | string;
  detail: string | null;
  changes: Record<string, unknown> | null;
  created_by: string | null;
  created_at: Date | string;
}

export interface TreeEventInsert {
  tree_id: string;
  orchard_id: string;
  event_type: TreeEventType;
  event_date?: string;
  detail?: string;
  changes?: Record<string, unknown>;
  created_by?: string;
}

/**
 * Record a tree event. Never throws on failure for automatic events —
 * an audit write must not break the user's actual change (same posture
 * as CiderPilot's audit logging).
 */
export async function insertTreeEvent(
  event: TreeEventInsert,
  opts: { bestEffort?: boolean } = {}
): Promise<void> {
  try {
    await sql`
      INSERT INTO tree_events (tree_id, orchard_id, event_type, event_date, detail, changes, created_by)
      VALUES (
        ${event.tree_id},
        ${event.orchard_id},
        ${event.event_type},
        ${event.event_date ?? null},
        ${event.detail ?? null},
        ${event.changes ? JSON.stringify(event.changes) : null},
        ${event.created_by ?? null}
      )
    `;
  } catch (error) {
    if (opts.bestEffort) {
      console.error('tree_events insert failed (best-effort):', error);
      return;
    }
    throw error;
  }
}

/** Latest events for one tree, newest first. */
export async function listTreeEvents(
  tree_id: string,
  limit = 20
): Promise<TreeEvent[]> {
  const { rows } = await sql`
    SELECT id, tree_id, orchard_id, event_type, event_date, detail, changes, created_by, created_at
    FROM tree_events
    WHERE tree_id = ${tree_id}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as TreeEvent[];
}

/**
 * Diff two tree records into an audit `changes` object of
 * { field: { from, to } }, restricted to fields present in `patch`.
 */
export function diffTreeChanges(
  before: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(patch)) {
    const from = before[key] ?? null;
    const to = patch[key] ?? null;
    if (String(from) !== String(to)) changes[key] = { from, to };
  }
  return changes;
}
