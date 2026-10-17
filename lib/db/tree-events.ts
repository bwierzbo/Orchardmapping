import { sql } from '@vercel/postgres';
import { toYMD } from '../dates';
import { INSPECTION_EVENT_TYPES } from '../tree-activity';
import {
  isEmptyWithoutPhoto,
  isRemovableEventType,
  statusAfterRemoval,
} from '../event-removal';

/** Automatic event types, written by the API when tree data changes. */
export const AUTO_EVENT_TYPES = [
  'created',
  'updated',
  'status_change',
  'moved',
  'deleted',
  // trees.harvest_completed_on set or cleared (073). Written by its own
  // route, never chosen from a menu: an empty "harvest complete" row with
  // nothing set on the tree would say the opposite of what the tree says.
  'harvest_complete',
  'harvest_reopened',
] as const;

/**
 * Passes the walk survey and the Inspect form record, each with a
 * structured payload in `changes`.
 *
 * Named separately from the hand-logged activities below because they are
 * written by a form rather than chosen from a menu -- the bulk-action
 * dropdown offers its own list and must not offer these.
 */
export const SURVEY_EVENT_TYPES = [
  'bloom',
  'fruit_check',
  'tree_condition',
  'harvest_readiness',
] as const;

/** Manual field-activity types a user can log from the tree panel. */
export const MANUAL_EVENT_TYPES = [
  'pruning',
  'spray',
  'fertilize',
  'observation',
  'harvest',
  'note',
  ...SURVEY_EVENT_TYPES,
] as const;

/** What a client is allowed to write. The API rejects anything else. */
export type ManualEventType = (typeof MANUAL_EVENT_TYPES)[number];

export type TreeEventType = (typeof AUTO_EVENT_TYPES)[number] | ManualEventType;

export interface TreeEvent {
  id: number;
  tree_id: string;
  orchard_id: string;
  event_type: TreeEventType;
  event_date: Date | string;
  detail: string | null;
  changes: Record<string, unknown> | null;
  photo_url: string | null;
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
  photo_url?: string;
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
      INSERT INTO tree_events (tree_id, orchard_id, event_type, event_date, detail, changes, photo_url, created_by)
      VALUES (
        ${event.tree_id},
        ${event.orchard_id},
        ${event.event_type},
        COALESCE(${event.event_date ?? null}, CURRENT_DATE),
        ${event.detail ?? null},
        ${event.changes ? JSON.stringify(event.changes) : null},
        ${event.photo_url ?? null},
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
    SELECT id, tree_id, orchard_id, event_type, event_date, detail, changes, photo_url, created_by, created_at
    FROM tree_events
    WHERE tree_id = ${tree_id} AND undone_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as TreeEvent[];
}

/** Events as the client reads them: calendar-day dates, ISO timestamps. */
export function toClientEvents(events: readonly TreeEvent[]) {
  return events.map((e) => ({
    ...e,
    event_date: toYMD(e.event_date),
    created_at: e.created_at ? new Date(e.created_at).toISOString() : null,
  }));
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

/**
 * The last day each tree in an orchard was looked at.
 *
 * Trees with no qualifying event are simply absent from the result —
 * "never inspected" is the absence of a row, and the map draws it as its
 * own thing rather than as a very old inspection.
 */
export async function lastInspectedByOrchard(
  orchardId: string
): Promise<Record<string, string>> {
  const result = await sql.query<{ tree_id: string; last_inspected: string }>(
    `SELECT tree_id, MAX(event_date)::text AS last_inspected
       FROM tree_events
      WHERE orchard_id = $1
        AND undone_at IS NULL
        AND event_type = ANY($2)
      GROUP BY tree_id`,
    [orchardId, INSPECTION_EVENT_TYPES as unknown as string[]]
  );
  const out: Record<string, string> = {};
  for (const row of result.rows) out[row.tree_id] = row.last_inspected;
  return out;
}

// ── Taking a mistake back out ────────────────────────────────────────────

/** Thrown for a request the caller got wrong; the route maps `status`. */
function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

/**
 * Delete one event from a tree's history, and undo what it did.
 *
 * Soft, like group undo: the row is marked `undone_at` and drops out of the
 * history, the photos and the inspection map, but is kept. Three kinds of
 * event wrote somewhere else as well, and those writes go with it:
 *  - status_change: the tree's status goes back (see statusAfterRemoval);
 *  - harvest from one tree: its harvests row is undone and last_harvest
 *    recomputed from the harvests left. A share of a block harvest is only
 *    this tree's line in it, so the block total is not touched;
 *  - "Seen on tree": the pest sightings the same Record wrote, which carry
 *    no link back to the event. They are matched by tree, pest and time --
 *    written in the two minutes before the event, as saveInspection does.
 */
export async function removeTreeEvent(
  treeId: string,
  eventId: number
): Promise<{ status: string | null }> {
  const client = await sql.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, event_type, event_date::text AS event_date, changes, created_at, group_action_id
         FROM tree_events
        WHERE id = $1 AND tree_id = $2 AND undone_at IS NULL
        FOR UPDATE`,
      [eventId, treeId]
    );
    const event = rows[0];
    if (!event) throw httpError('That entry is not in this tree\'s history', 404);
    if (!isRemovableEventType(event.event_type)) {
      throw httpError('Edits to the tree itself stay in its history', 400);
    }

    await client.query('UPDATE tree_events SET undone_at = NOW() WHERE id = $1', [eventId]);

    const changes = (event.changes ?? {}) as Record<string, unknown>;

    if (event.event_type === 'status_change' && changes.status) {
      const removed = changes.status as { from: unknown; to: unknown };
      const { rows: later } = await client.query(
        `SELECT 1 FROM tree_events
          WHERE tree_id = $1 AND event_type = 'status_change' AND undone_at IS NULL
            AND created_at > $2
          LIMIT 1`,
        [treeId, event.created_at]
      );
      const { rows: prev } = await client.query(
        `SELECT changes->'status'->>'to' AS status FROM tree_events
          WHERE tree_id = $1 AND event_type = 'status_change' AND undone_at IS NULL
          ORDER BY created_at DESC LIMIT 1`,
        [treeId]
      );
      const { rows: tree } = await client.query(
        'SELECT status FROM trees WHERE tree_id = $1',
        [treeId]
      );
      const next = statusAfterRemoval({
        current: tree[0]?.status ?? null,
        removed,
        removedIsLatest: later.length === 0,
        previousTo: prev[0]?.status ?? null,
      });
      if (next !== null) {
        await client.query(
          'UPDATE trees SET status = $1, updated_at = NOW() WHERE tree_id = $2',
          [next, treeId]
        );
      }
    }

    if (event.event_type === 'harvest') {
      if (event.group_action_id == null) {
        // The closest-in-time match, so two identical picks on one day
        // lose one row each, not both.
        await client.query(
          `UPDATE harvests SET undone_at = NOW()
            WHERE id = (
              SELECT id FROM harvests
               WHERE tree_id = $1 AND group_action_id IS NULL AND undone_at IS NULL
                 AND harvest_date = $2::date
                 AND quantity = $3::numeric AND unit = $4
               ORDER BY ABS(EXTRACT(EPOCH FROM created_at - $5::timestamptz))
               LIMIT 1
            )`,
          [treeId, event.event_date, changes.quantity ?? null, changes.unit ?? null, event.created_at]
        );
      }
      // Only rewound when this harvest was the one that set it: a date
      // typed into the tree's own form is somebody's decision.
      await client.query(
        `UPDATE trees SET last_harvest = (
            SELECT MAX(event_date) FROM tree_events
             WHERE tree_id = $1 AND event_type = 'harvest' AND undone_at IS NULL
          ), updated_at = NOW()
          WHERE tree_id = $1 AND last_harvest = $2::date`,
        [treeId, event.event_date]
      );
    }

    if (event.event_type === 'observation' && changes.pests && typeof changes.pests === 'object') {
      await client.query(
        `UPDATE pest_observations SET deleted_at = NOW()
          WHERE tree_id = $1 AND pest_key = ANY($2) AND deleted_at IS NULL
            AND created_at BETWEEN $3::timestamptz - INTERVAL '2 minutes'
                               AND $3::timestamptz + INTERVAL '5 seconds'`,
        [treeId, Object.keys(changes.pests as object), event.created_at]
      );
    }

    const { rows: after } = await client.query(
      'SELECT status FROM trees WHERE tree_id = $1',
      [treeId]
    );
    await client.query('COMMIT');
    return { status: after[0]?.status ?? null };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Take a photo off a tree. The same picture can ride on more than one event
 * (the photo series shows it once), so it comes off all of them; an event
 * left with nothing else in it is deleted along with it. The file itself is
 * left in Blob storage.
 */
export async function removeTreePhoto(treeId: string, photoUrl: string): Promise<number> {
  const client = await sql.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE tree_events SET photo_url = NULL
        WHERE tree_id = $1 AND photo_url = $2 AND undone_at IS NULL
        RETURNING id, event_type, detail, changes`,
      [treeId, photoUrl]
    );
    if (rows.length === 0) throw httpError('That photo is not on this tree', 404);
    const empty = rows.filter(isEmptyWithoutPhoto).map((r) => r.id);
    if (empty.length > 0) {
      await client.query('UPDATE tree_events SET undone_at = NOW() WHERE id = ANY($1)', [empty]);
    }
    await client.query('COMMIT');
    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
