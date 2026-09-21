import { sql } from '@vercel/postgres';
import { getTreesByOrchard, updateTree, TREE_UPDATABLE_COLUMNS, type Tree } from './trees';
import { MANUAL_EVENT_TYPES } from './tree-events';
import { filterTrees, describeFilter, type GroupFilter } from '../group-filter';
import { normalizeAddressPart } from '../address';
import { serializeTree } from '../serialize';

/**
 * Fields a one-value-for-everything group action may set. The address is
 * excluded because setting a whole selection to one row and position
 * would collide by definition; per-tree edits below can change it.
 */
export const GROUP_SETTABLE_FIELDS = TREE_UPDATABLE_COLUMNS.filter(
  (c) => !['block_id', 'row_id', 'position', 'lat', 'lng'].includes(c)
);

/**
 * Fields a per-tree edit may set. The address is in: each tree gets its
 * own value, so a whole row can be renumbered or a selection moved into a
 * block. Coordinates stay out -- those are dragged on the map.
 */
export const TREE_EDIT_FIELDS = TREE_UPDATABLE_COLUMNS.filter(
  (c) => !['lat', 'lng'].includes(c)
);

const ADDRESS_FIELDS = ['block_id', 'row_id', 'position'] as const;

export type GroupActionInput =
  | {
      kind: 'log_event';
      eventType: (typeof MANUAL_EVENT_TYPES)[number];
      eventDate?: string;
      detail?: string;
    }
  | { kind: 'set_field'; field: string; value: string | null }
  | {
      kind: 'harvest';
      harvestDate: string;
      weightLbs: number;
      brix?: number;
      sg?: number;
      ph?: number;
      detail?: string;
    };

/** One tree's worth of changes: only the fields the editor actually touched. */
export interface TreeEdit {
  treeId: string;
  fields: Record<string, string | null>;
}

export interface GroupActionRecord {
  id: number;
  orchard_id: string;
  action_kind: 'log_event' | 'set_field' | 'harvest' | 'edit_trees';
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
        action.kind === 'log_event' ? action.eventType : action.kind === 'harvest' ? 'harvest' : null,
        action.kind === 'log_event'
          ? (action.eventDate ?? null)
          : action.kind === 'harvest'
            ? action.harvestDate
            : null,
        action.kind !== 'set_field' ? (action.detail ?? null) : null,
        action.kind === 'set_field' ? action.field : null,
        action.kind === 'set_field' ? action.value : null,
        targets.length,
        userId,
      ]
    );
    const groupId: number = rows[0].id;

    if (action.kind === 'harvest') {
      await client.query(
        `INSERT INTO harvests (orchard_id, group_action_id, harvest_date, weight_lbs, brix, sg, ph, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          orchardId,
          groupId,
          action.harvestDate,
          action.weightLbs,
          action.brix ?? null,
          action.sg ?? null,
          action.ph ?? null,
          action.detail ?? null,
          userId,
        ]
      );
      // Fan a harvest event to each picked tree
      const detail = `${action.weightLbs} lbs total${action.brix ? ` · ${action.brix}°Bx` : ''}${action.detail ? ` — ${action.detail}` : ''}`;
      const CHUNK = 200;
      for (let i = 0; i < targets.length; i += CHUNK) {
        const chunk = targets.slice(i, i + CHUNK);
        const values: unknown[] = [];
        const tuples = chunk.map((t, j) => {
          const base = j * 6;
          values.push(t.tree_id, orchardId, action.harvestDate, detail, userId, groupId);
          return `($${base + 1},$${base + 2},'harvest',$${base + 3}::date,$${base + 4},$${base + 5},$${base + 6})`;
        });
        await client.query(
          `INSERT INTO tree_events (tree_id, orchard_id, event_type, event_date, detail, created_by, group_action_id)
           VALUES ${tuples.join(',')}`,
          values
        );
      }
    } else if (action.kind === 'log_event') {
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

export interface TreeEditResult {
  groupId: number;
  treeCount: number;
  fieldsTouched: string[];
}

/**
 * Apply per-tree edits: the grid's save, and the only path that can give
 * different trees different values.
 *
 * Recorded as one group action with the per-tree diffs on the fan-out
 * events, so the whole save appears once in the activity list, shows up
 * in each tree's own history, and undoes as a unit.
 *
 * The address constraint is deferred, which is what lets a save swap two
 * trees or renumber a row end-to-end; a genuine collision still fails,
 * and is reported as a collision rather than a raw constraint error.
 */
export async function applyTreeEdits(
  orchardId: string,
  edits: TreeEdit[],
  userId: string
): Promise<TreeEditResult> {
  if (edits.length === 0) {
    throw Object.assign(new Error('Nothing to save'), { status: 400 });
  }

  // Column names are interpolated into SQL below — whitelist is mandatory
  for (const edit of edits) {
    for (const field of Object.keys(edit.fields)) {
      if (!(TREE_EDIT_FIELDS as readonly string[]).includes(field)) {
        throw Object.assign(new Error(`Field not settable: ${field}`), { status: 400 });
      }
    }
  }

  const byId = new Map(edits.map((e) => [e.treeId, e]));
  if (byId.size !== edits.length) {
    throw Object.assign(new Error('The same tree appears twice in this save'), { status: 400 });
  }

  const client = await sql.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS trees_orchard_address_uniq DEFERRED');

    const { rows: current } = await client.query(
      `SELECT * FROM trees WHERE orchard_id = $1 AND tree_id = ANY($2::text[]) FOR UPDATE`,
      [orchardId, [...byId.keys()]]
    );
    if (current.length !== byId.size) {
      const found = new Set(current.map((t) => String(t.tree_id)));
      const missing = [...byId.keys()].filter((id) => !found.has(id));
      throw Object.assign(
        new Error(`${missing.length} tree(s) are not in this orchard: ${missing.slice(0, 3).join(', ')}`),
        { status: 400 }
      );
    }

    // Work out the real diffs first: a grid sends whole rows, most of
    // which are unchanged, and an unchanged field must not appear in the
    // tree's history or be revertible by undo.
    const diffs: Array<{ treeId: string; changes: Record<string, { from: unknown; to: unknown }> }> = [];
    for (const tree of current) {
      const edit = byId.get(String(tree.tree_id))!;
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const [field, raw] of Object.entries(edit.fields)) {
        const to = (ADDRESS_FIELDS as readonly string[]).includes(field)
          ? normalizeAddressPart(raw)
          : raw === '' ? null : raw;
        const from = (tree as Record<string, unknown>)[field] ?? null;
        if (String(from ?? '') === String(to ?? '')) continue;
        changes[field] = { from, to };
      }
      if (Object.keys(changes).length > 0) diffs.push({ treeId: String(tree.tree_id), changes });
    }

    if (diffs.length === 0) {
      await client.query('ROLLBACK');
      return { groupId: 0, treeCount: 0, fieldsTouched: [] };
    }

    const fieldsTouched = [...new Set(diffs.flatMap((d) => Object.keys(d.changes)))].sort();
    const scope = { filter: { treeIds: diffs.map((d) => d.treeId) }, summary: describeFilter({ treeIds: diffs.map((d) => d.treeId) }) };

    const { rows: groupRows } = await client.query(
      `INSERT INTO group_actions
         (orchard_id, action_kind, scope, detail, tree_count, created_by)
       VALUES ($1, 'edit_trees', $2, $3, $4, $5) RETURNING id`,
      [orchardId, JSON.stringify(scope), fieldsTouched.join(', '), diffs.length, userId]
    );
    const groupId: number = groupRows[0].id;

    for (const diff of diffs) {
      const fields = Object.keys(diff.changes);
      const assignments = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
      const values = fields.map((f) => diff.changes[f].to);
      await client.query(
        `UPDATE trees SET ${assignments}, updated_at = NOW() WHERE tree_id = $${fields.length + 1}`,
        [...values, diff.treeId]
      );
      const movedOnly = fields.every((f) => (ADDRESS_FIELDS as readonly string[]).includes(f));
      await client.query(
        `INSERT INTO tree_events (tree_id, orchard_id, event_type, changes, created_by, group_action_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          diff.treeId,
          orchardId,
          movedOnly ? 'moved' : fields.length === 1 && fields[0] === 'status' ? 'status_change' : 'updated',
          JSON.stringify(diff.changes),
          userId,
          groupId,
        ]
      );
    }

    await client.query('COMMIT');
    return { groupId, treeCount: diffs.length, fieldsTouched };
  } catch (error) {
    await client.query('ROLLBACK');
    // The deferred address constraint fires at COMMIT, so a collision
    // surfaces here rather than at the offending row.
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      throw Object.assign(
        new Error('Two trees would end up in the same spot. Check the highlighted rows.'),
        { status: 409 }
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Undo a group action. log_event: mark the fan-out events undone (hidden
 * from history, kept for audit). set_field and edit_trees: revert each
 * tree whose current value still equals what the action set — trees
 * changed since are skipped and counted, so undo never clobbers newer
 * work. An edit_trees event may carry several fields; a tree counts as
 * reverted if any of them could be put back.
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

  if (group.action_kind === 'log_event' || group.action_kind === 'harvest') {
    const res = await sql`
      UPDATE tree_events SET undone_at = NOW()
      WHERE group_action_id = ${groupId} AND undone_at IS NULL
    `;
    reverted = res.rowCount ?? 0;
    if (group.action_kind === 'harvest') {
      await sql`UPDATE harvests SET undone_at = NOW() WHERE group_action_id = ${groupId}`;
    }
  } else {
    const { rows: events } = await sql`
      SELECT id, tree_id, changes FROM tree_events
      WHERE group_action_id = ${groupId} AND undone_at IS NULL
    `;
    // set_field records one field on the group row; edit_trees records
    // whatever each tree's own diff holds.
    const allowed =
      group.action_kind === 'edit_trees' ? TREE_EDIT_FIELDS : GROUP_SETTABLE_FIELDS;
    const groupField = group.action_kind === 'edit_trees' ? null : group.field!;
    if (groupField && !(allowed as readonly string[]).includes(groupField)) {
      throw Object.assign(new Error(`Field not settable: ${groupField}`), { status: 400 });
    }

    const client = await sql.connect();
    try {
      await client.query('BEGIN');
      // Reverting a whole row's worth of positions puts trees back through
      // spots that are briefly occupied, same as the save that made them.
      await client.query('SET CONSTRAINTS trees_orchard_address_uniq DEFERRED');
      for (const e of events) {
        const changes = e.changes as Record<string, { from: unknown; to: unknown }>;
        const fields = groupField ? [groupField] : Object.keys(changes);
        let revertedAny = false;
        for (const field of fields) {
          const change = changes[field];
          if (!change) continue;
          if (!(allowed as readonly string[]).includes(field)) {
            throw Object.assign(new Error(`Field not settable: ${field}`), { status: 400 });
          }
          const res = await client.query(
            // Conditional revert: only when the current value is still `to`
            `UPDATE trees SET ${field} = $1, updated_at = NOW()
             WHERE tree_id = $2 AND COALESCE(${field}::text, '') = COALESCE($3::text, '')`,
            [change.from ?? null, e.tree_id, change.to ?? null]
          );
          if (res.rowCount) revertedAny = true;
        }
        if (revertedAny) {
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
