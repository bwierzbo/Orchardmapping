import { sql } from '@vercel/postgres';
import { getTreesByOrchard, updateTree, TREE_UPDATABLE_COLUMNS, type Tree } from './trees';
import { MANUAL_EVENT_TYPES } from './tree-events';
import { filterTrees, describeFilter, type GroupFilter } from '../group-filter';
import { serializeTree } from '../serialize';

/** Fields a group action may set. Identity (row/position) is excluded. */
export const GROUP_SETTABLE_FIELDS = TREE_UPDATABLE_COLUMNS.filter(
  (c) => !['row_id', 'position', 'lat', 'lng'].includes(c)
);

export type GroupActionInput =
  | {
      kind: 'log_event';
      eventType: (typeof MANUAL_EVENT_TYPES)[number];
      eventDate?: string;
      detail?: string;
    }
  | { kind: 'set_field'; field: string; value: string | null };

export interface GroupActionRecord {
  id: number;
  orchard_id: string;
  action_kind: 'log_event' | 'set_field';
  scope: { filter: GroupFilter; summary: string };
  event_type: string | null;
  event_date: Date | string | null;
  detail: string | null;
  field: string | null;
  value: string | null;
  tree_count: number;
  created_by: string | null;
  created_at: Date | string;
  undone_at: Date | string | null;
}

/** Resolve a filter to live trees, server-side. */
export async function resolveGroup(orchardId: string, filter: GroupFilter): Promise<Tree[]> {
  const all = await getTreesByOrchard(orchardId);
  // Reuse the exact client-side predicate so preview counts always match
  const clientShaped = all.map(serializeTree);
  const matchIds = new Set(filterTrees(clientShaped, filter).map((t) => t.tree_id));
  return all.filter((t) => matchIds.has(t.tree_id));
}

/**
 * Apply a group action: create the group record, then fan out per tree —
 * an event row for log_event; a field update plus a diff-carrying event
 * for set_field. Runs in one transaction: all trees or none.
 */
export async function applyGroupAction(
  orchardId: string,
  filter: GroupFilter,
  action: GroupActionInput,
  userId: string
): Promise<{ groupId: number; treeCount: number }> {
  // Field name is interpolated into SQL below — whitelist is mandatory
  if (
    action.kind === 'set_field' &&
    !(GROUP_SETTABLE_FIELDS as readonly string[]).includes(action.field)
  ) {
    throw Object.assign(new Error(`Field not settable: ${action.field}`), { status: 400 });
  }

  const targets = await resolveGroup(orchardId, filter);
  if (targets.length === 0) {
    throw Object.assign(new Error('No trees match this filter'), { status: 400 });
  }

  const scope = { filter, summary: describeFilter(filter) };
  const client = await sql.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO group_actions
         (orchard_id, action_kind, scope, event_type, event_date, detail, field, value, tree_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        orchardId,
        action.kind,
        JSON.stringify(scope),
        action.kind === 'log_event' ? action.eventType : null,
        action.kind === 'log_event' ? (action.eventDate ?? null) : null,
        action.kind === 'log_event' ? (action.detail ?? null) : null,
        action.kind === 'set_field' ? action.field : null,
        action.kind === 'set_field' ? action.value : null,
        targets.length,
        userId,
      ]
    );
    const groupId: number = rows[0].id;

    if (action.kind === 'log_event') {
      // Chunked multi-row insert of identical events
      const CHUNK = 200;
      for (let i = 0; i < targets.length; i += CHUNK) {
        const chunk = targets.slice(i, i + CHUNK);
        const values: unknown[] = [];
        const tuples = chunk.map((t, j) => {
          const base = j * 7;
          values.push(
            t.tree_id,
            orchardId,
            action.eventType,
            action.eventDate ?? null,
            action.detail ?? null,
            userId,
            groupId
          );
          return `($${base + 1},$${base + 2},$${base + 3},COALESCE($${base + 4}::date, CURRENT_DATE),$${base + 5},$${base + 6},$${base + 7})`;
        });
        await client.query(
          `INSERT INTO tree_events (tree_id, orchard_id, event_type, event_date, detail, created_by, group_action_id)
           VALUES ${tuples.join(',')}`,
          values
        );
      }
    } else {
      // set_field: per-tree update + diff event (from → to enables undo)
      for (const t of targets) {
        const before = (t as unknown as Record<string, unknown>)[action.field] ?? null;
        const after = action.value;
        if (String(before ?? '') === String(after ?? '')) continue; // no-op tree
        await client.query(
          `UPDATE trees SET ${action.field} = $1, updated_at = NOW() WHERE tree_id = $2`,
          [after, t.tree_id]
        );
        await client.query(
          `INSERT INTO tree_events (tree_id, orchard_id, event_type, detail, changes, created_by, group_action_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            t.tree_id,
            orchardId,
            action.field === 'status' ? 'status_change' : 'updated',
            null,
            JSON.stringify({ [action.field]: { from: before, to: after } }),
            userId,
            groupId,
          ]
        );
      }
    }

    await client.query('COMMIT');
    return { groupId, treeCount: targets.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Undo a group action. log_event: mark the fan-out events undone (hidden
 * from history, kept for audit). set_field: revert each tree whose
 * current value still equals what the action set — trees changed since
 * are skipped and counted, so undo never clobbers newer work.
 */
export async function undoGroupAction(
  groupId: number,
  userId: string
): Promise<{ reverted: number; skipped: number }> {
  const { rows } = await sql`SELECT * FROM group_actions WHERE id = ${groupId}`;
  const group = rows[0] as GroupActionRecord | undefined;
  if (!group) throw Object.assign(new Error('Action not found'), { status: 404 });
  if (group.undone_at) throw Object.assign(new Error('Already undone'), { status: 409 });

  let reverted = 0;
  let skipped = 0;

  if (group.action_kind === 'log_event') {
    const res = await sql`
      UPDATE tree_events SET undone_at = NOW()
      WHERE group_action_id = ${groupId} AND undone_at IS NULL
    `;
    reverted = res.rowCount ?? 0;
  } else {
    const { rows: events } = await sql`
      SELECT id, tree_id, changes FROM tree_events
      WHERE group_action_id = ${groupId} AND undone_at IS NULL
    `;
    const field = group.field!;
    if (!(GROUP_SETTABLE_FIELDS as readonly string[]).includes(field)) {
      throw Object.assign(new Error(`Field not settable: ${field}`), { status: 400 });
    }
    const client = await sql.connect();
    try {
      await client.query('BEGIN');
      for (const e of events) {
        const change = (e.changes as Record<string, { from: unknown; to: unknown }>)[field];
        if (!change) continue;
        const res = await client.query(
          // Conditional revert: only when the current value is still `to`
          `UPDATE trees SET ${field} = $1, updated_at = NOW()
           WHERE tree_id = $2 AND COALESCE(${field}::text, '') = COALESCE($3::text, '')`,
          [change.from ?? null, e.tree_id, change.to ?? null]
        );
        if (res.rowCount) {
          reverted++;
          await client.query(`UPDATE tree_events SET undone_at = NOW() WHERE id = $1`, [e.id]);
        } else {
          skipped++;
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  await sql`
    UPDATE group_actions SET undone_at = NOW(), undone_by = ${userId}
    WHERE id = ${groupId}
  `;
  return { reverted, skipped };
}

/** Recent group actions for the undo panel (newest first). */
export async function listGroupActions(
  orchardId: string,
  hours = 24
): Promise<GroupActionRecord[]> {
  const { rows } = await sql`
    SELECT * FROM group_actions
    WHERE orchard_id = ${orchardId}
      AND created_at > NOW() - make_interval(hours => ${hours})
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return rows as GroupActionRecord[];
}
