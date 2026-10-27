import { db, sql } from '@vercel/postgres';
import { toYMD } from '../dates';
import { isHarvestComplete } from '../tree-harvest-season';
import {
  describeGraftPlace,
  GRAFT_STATUS_LABEL,
  sameVariety,
  treeVarieties,
  varietyCompletions,
  wholeTreeCompletedOn,
  type ClientGraft,
  type GraftInput,
  type GraftStatus,
  type ScaffoldDirection,
  type ScaffoldTier,
} from '../grafts';

/**
 * Varieties grafted onto a tree (076). Every add and change writes a
 * graft_added / graft_changed row into the tree's history in the same
 * transaction, carrying the photo when there is one, so the history and
 * the photo strip both show it.
 */

/** Fields a graft edit may set; column names never come from the request. */
const GRAFT_FIELDS = [
  'variety',
  'scaffold_direction',
  'scaffold_tier',
  'tag',
  'grafted_on',
  'status',
  'status_on',
  'photo_url',
  'notes',
] as const;

function decodeGraft(row: Record<string, unknown>): ClientGraft {
  const text = (v: unknown) => (v == null || v === '' ? null : String(v));
  return {
    id: Number(row.id),
    tree_id: String(row.tree_id),
    variety: String(row.variety),
    scaffold_direction: text(row.scaffold_direction) as ScaffoldDirection | null,
    scaffold_tier: row.scaffold_tier == null ? null : (Number(row.scaffold_tier) as ScaffoldTier),
    tag: text(row.tag),
    grafted_on: toYMD(row.grafted_on as Date | string | null),
    status: String(row.status) as GraftStatus,
    status_on: toYMD(row.status_on as Date | string | null),
    photo_url: text(row.photo_url),
    notes: text(row.notes),
    harvest_completed_on: toYMD(row.harvest_completed_on as Date | string | null),
  };
}

type Queryable = { query: (q: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

/**
 * Work the whole tree's picked-out date out again after its varieties
 * changed -- a graft added, cut out or failed -- so the map's check never
 * waits for somebody to tap a variety. Only this season is judged: a date
 * from an earlier year already reads as open and is left as the record of
 * when that season ended.
 */
async function recomputeWholeTree(client: Queryable, treeId: string, year: number): Promise<void> {
  const { rows: treeRows } = await client.query(
    'SELECT variety, main_harvest_completed_on, harvest_completed_on FROM trees WHERE tree_id = $1 FOR UPDATE',
    [treeId]
  );
  if (treeRows.length === 0) return;
  const { rows: graftRows } = await client.query('SELECT * FROM tree_grafts WHERE tree_id = $1', [treeId]);
  const t = treeRows[0];
  const whole = wholeTreeCompletedOn(
    varietyCompletions(
      t.variety == null ? null : String(t.variety),
      toYMD(t.main_harvest_completed_on as Date | string | null),
      graftRows.map(decodeGraft)
    ),
    year
  );
  const before = toYMD(t.harvest_completed_on as Date | string | null);
  if (whole === before) return;
  if (whole === null && !isHarvestComplete(before, year)) return;
  await client.query('UPDATE trees SET harvest_completed_on = $2, updated_at = NOW() WHERE tree_id = $1', [
    treeId,
    whole,
  ]);
}

/** The calendar year a change counts for: its own date if it has one. */
function yearOf(date: string | null | undefined): number {
  return Number((date ?? toYMD(new Date())!).slice(0, 4));
}

/** A tree's grafts, growing ones first, then in the order they were added. */
export async function listGrafts(treeId: string): Promise<ClientGraft[]> {
  const { rows } = await sql`
    SELECT * FROM tree_grafts
    WHERE tree_id = ${treeId}
    ORDER BY (status = 'growing') DESC, id
  `;
  return rows.map(decodeGraft);
}

/** "Chehalis, 2nd tier, NE scaffold (blue tape)" -- the history line. */
function describeGraft(g: Pick<ClientGraft, 'variety' | 'scaffold_direction' | 'scaffold_tier' | 'tag'>): string {
  const place = describeGraftPlace(g);
  return [g.variety, place].filter(Boolean).join(', ') + (g.tag ? ` (${g.tag})` : '');
}

/** Trim text to null, so an emptied field clears rather than storing ''. */
function clean(input: Partial<GraftInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of GRAFT_FIELDS) {
    if (!(f in input)) continue;
    const v = (input as Record<string, unknown>)[f];
    out[f] = typeof v === 'string' ? v.trim() || null : v ?? null;
  }
  return out;
}

export async function insertGraft(
  tree: { tree_id: string; orchard_id: string },
  input: GraftInput,
  userId: string
): Promise<ClientGraft> {
  const fields = { ...clean(input), status: input.status ?? 'growing' };
  const columns = ['tree_id', 'orchard_id', 'created_by', ...Object.keys(fields)];
  const values = [tree.tree_id, tree.orchard_id, userId, ...Object.values(fields)];
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO tree_grafts (${columns.join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING *`,
      values
    );
    const graft = decodeGraft(rows[0]);
    await client.query(
      `INSERT INTO tree_events (tree_id, orchard_id, event_type, event_date, detail, changes, photo_url, created_by)
       VALUES ($1, $2, 'graft_added', COALESCE($3::date, CURRENT_DATE), $4, $5, $6, $7)`,
      [
        tree.tree_id,
        tree.orchard_id,
        graft.grafted_on,
        `Grafted ${describeGraft(graft)}`,
        JSON.stringify({ graft_id: graft.id }),
        graft.photo_url,
        userId,
      ]
    );
    // A new variety has not been picked, so a tree closed for the season
    // opens again until it is.
    await recomputeWholeTree(client, tree.tree_id, yearOf(null));
    await client.query('COMMIT');
    return graft;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Change a graft. Only what actually differs is written and recorded, so a
 * form saved unchanged leaves no history row. Null when the graft is not on
 * this tree.
 */
export async function updateGraft(
  treeId: string,
  graftId: number,
  patch: Partial<GraftInput>,
  userId: string
): Promise<ClientGraft | null> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: found } = await client.query(
      'SELECT * FROM tree_grafts WHERE id = $1 AND tree_id = $2 FOR UPDATE',
      [graftId, treeId]
    );
    if (found.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const before = decodeGraft(found[0]);
    const next = clean(patch);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [field, to] of Object.entries(next)) {
      const from = (before as unknown as Record<string, unknown>)[field] ?? null;
      if (String(from ?? '') !== String(to ?? '')) changes[field] = { from, to };
    }
    if (Object.keys(changes).length === 0) {
      await client.query('ROLLBACK');
      return before;
    }
    const fields = Object.keys(changes);
    const { rows } = await client.query(
      `UPDATE tree_grafts
          SET ${fields.map((f, i) => `${f} = $${i + 1}`).join(', ')}, updated_at = now()
        WHERE id = $${fields.length + 1}
        RETURNING *`,
      [...fields.map((f) => changes[f].to), graftId]
    );
    const graft = decodeGraft(rows[0]);
    const statusNote =
      'status' in changes ? `: ${GRAFT_STATUS_LABEL[graft.status].toLowerCase()}` : '';
    await client.query(
      `INSERT INTO tree_events (tree_id, orchard_id, event_type, event_date, detail, changes, photo_url, created_by)
       VALUES ($1, $2, 'graft_changed', COALESCE($3::date, CURRENT_DATE), $4, $5, $6, $7)`,
      [
        treeId,
        found[0].orchard_id,
        'status_on' in changes || 'status' in changes ? graft.status_on : null,
        `${describeGraft(graft)}${statusNote}`,
        JSON.stringify({ graft_id: graftId, ...changes }),
        'photo_url' in changes ? graft.photo_url : null,
        userId,
      ]
    );
    if ('status' in changes || 'variety' in changes) {
      await recomputeWholeTree(client, treeId, yearOf(graft.status_on));
    }
    await client.query('COMMIT');
    return graft;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Mark one variety on a grafted tree picked out for the season, or open it
 * again, and work out the whole tree from all its varieties -- in one
 * transaction with its history row, so the map's check and the per-variety
 * state can never disagree.
 *
 * `complete` true closes the variety on `date`; false reopens it. Asking
 * for the state a variety is already in writes no history row, but the
 * whole tree is still worked out again: a graft cut out since may have
 * been the only thing holding the tree open.
 */
export async function setVarietyHarvestComplete(
  treeId: string,
  variety: string,
  complete: boolean,
  date: string,
  userId: string
): Promise<{ variety: string; varietyCompletedOn: string | null; wholeCompletedOn: string | null }> {
  const year = Number(date.slice(0, 4));
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: treeRows } = await client.query(
      `SELECT tree_id, orchard_id, variety, main_harvest_completed_on, harvest_completed_on
         FROM trees WHERE tree_id = $1 FOR UPDATE`,
      [treeId]
    );
    if (treeRows.length === 0) throw Object.assign(new Error('Tree not found'), { status: 404 });
    const tree = treeRows[0];
    const { rows: graftRows } = await client.query(
      'SELECT * FROM tree_grafts WHERE tree_id = $1 FOR UPDATE',
      [treeId]
    );
    const grafts = graftRows.map(decodeGraft);
    const mainVariety = tree.variety == null ? null : String(tree.variety);

    const name = treeVarieties(mainVariety, grafts).find((v) => sameVariety(v, variety));
    if (!name) {
      throw Object.assign(new Error(`${variety} is not growing on this tree.`), { status: 400 });
    }
    const isMain = sameVariety(name, mainVariety);
    let mainCompletedOn = toYMD(tree.main_harvest_completed_on as Date | string | null);
    const before = varietyCompletions(mainVariety, mainCompletedOn, grafts).find((c) =>
      sameVariety(c.variety, name)
    )!.completedOn;
    const wasComplete = isHarvestComplete(before, year);
    const changed = complete ? !wasComplete : before !== null;
    const next = complete ? date : null;

    if (changed) {
      if (isMain) {
        mainCompletedOn = next;
      } else {
        for (const g of grafts) {
          if (g.status === 'growing' && sameVariety(g.variety, name)) g.harvest_completed_on = next;
        }
        await client.query(
          `UPDATE tree_grafts SET harvest_completed_on = $3, updated_at = now()
            WHERE tree_id = $1 AND status = 'growing' AND lower(btrim(variety)) = lower(btrim($2))`,
          [treeId, name, next]
        );
      }
    }

    const wholeBefore = toYMD(tree.harvest_completed_on as Date | string | null);
    const wholeCompletedOn = wholeTreeCompletedOn(
      varietyCompletions(mainVariety, mainCompletedOn, grafts),
      year
    );
    await client.query(
      `UPDATE trees SET main_harvest_completed_on = $2, harvest_completed_on = $3, updated_at = NOW()
        WHERE tree_id = $1`,
      [treeId, mainCompletedOn, wholeCompletedOn]
    );

    if (changed) {
      await client.query(
        `INSERT INTO tree_events (tree_id, orchard_id, event_type, event_date, detail, changes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          treeId,
          tree.orchard_id,
          complete ? 'harvest_complete' : 'harvest_reopened',
          date,
          complete
            ? `${name} picked out for ${year}` + (wholeCompletedOn ? ' — the whole tree is done' : '')
            : `${name} reopened — more to pick`,
          JSON.stringify({
            variety: name,
            variety_completed_on: { from: before, to: next },
            harvest_completed_on: { from: wholeBefore, to: wholeCompletedOn },
          }),
          userId,
        ]
      );
    }

    await client.query('COMMIT');
    return { variety: name, varietyCompletedOn: changed ? next : before, wholeCompletedOn };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
