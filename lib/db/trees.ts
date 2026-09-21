import { sql, db } from '@vercel/postgres';
import { buildUpdateSet } from './sql-helpers';
import { insertTreeEvent } from './tree-events';
import { toNumOrUndefined } from './decode';
import { normalizeAddress, addressKey, formatAddress, type TreeAddress } from '../address';

/**
 * Columns a client is allowed to change through updateTree.
 * Identifier keys (id, tree_id, orchard_id, timestamps) are deliberately
 * excluded; column names must never come from request data directly.
 */
export const TREE_UPDATABLE_COLUMNS = [
  'name',
  'variety',
  'fruit_type',
  'status',
  'planted_date',
  'block_id',
  'row_id',
  'position',
  'age',
  'height',
  'lat',
  'lng',
  'last_pruned',
  'last_harvest',
  'yield_estimate',
  'notes',
  'rootstock',
  'source',
  'acquired_date',
] as const;

/**
 * Tree database interface
 * Matches the schema in lib/db/migrations/
 */
export interface Tree {
  id: number;
  tree_id: string;
  tree_no?: number;
  legacy_tree_id?: string;
  orchard_id: string;
  name?: string;
  variety?: string;
  fruit_type?: string;
  status?: string;
  planted_date?: Date | string;
  block_id?: string;
  row_id?: string;
  position?: string;
  age?: number;
  height?: number;
  lat?: number;
  lng?: number;
  last_pruned?: Date | string;
  last_harvest?: Date | string;
  yield_estimate?: number;
  notes?: string;
  rootstock?: string;
  source?: string;
  acquired_date?: Date | string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Tree data for insertion (minimal required fields)
 */
export interface TreeInsertData {
  orchard_id: string;
  block_id?: string | null;
  row_id?: string | null;
  position?: string | number | null;
  lat?: number;
  lng?: number;
  variety?: string;
  fruit_type?: string;
  status?: string;
  planted_date?: Date | string;
  age?: number;
  height?: number;
  last_pruned?: Date | string;
  last_harvest?: Date | string;
  yield_estimate?: number;
  notes?: string;
}

/**
 * Coerce DECIMAL columns (returned as strings by @vercel/postgres) so a
 * row matches the Tree interface. Applied to every row leaving this module.
 */
function decodeTreeRow(row: Record<string, unknown>): Tree {
  return {
    ...(row as unknown as Tree),
    lat: toNumOrUndefined(row.lat as string | number | null),
    lng: toNumOrUndefined(row.lng as string | number | null),
    height: toNumOrUndefined(row.height as string | number | null),
    yield_estimate: toNumOrUndefined(row.yield_estimate as string | number | null),
  };
}

/** A tree's permanent id: <SITE>-<ORCHARD>-<NUMBER>, e.g. OBC-001-0142. */
export function formatTreeId(
  siteCode: string,
  orchardCode: string,
  treeNo: number
): string {
  return `${siteCode}-${orchardCode}-${String(treeNo).padStart(4, '0')}`;
}

/**
 * Hand out the next permanent id for an orchard.
 *
 * The id says where a tree came from, never where it is now: a tree keeps
 * it for life, through every move, so the history that references it by
 * string never has to be rewritten. The counter only moves forward --
 * numbers are never reused, even after a tree is deleted -- and the bump
 * happens in the same statement that reads it, so two people adding trees
 * at once cannot be handed the same number.
 */
async function allocateTreeIds(
  client: SqlClient,
  orchardId: string,
  count: number
): Promise<Array<{ treeId: string; treeNo: number }>> {
  if (count <= 0) return [];
  const { rows } = await client.query(
    `UPDATE orchards o
        SET next_tree_no = o.next_tree_no + $2
       FROM sites s
      WHERE o.id = $1 AND s.id = o.site_id
      RETURNING o.next_tree_no - $2 AS first_no, s.code AS site_code, o.code AS orchard_code`,
    [orchardId, count]
  );
  if (rows.length === 0) {
    throw new Error(`Unknown orchard "${orchardId}", or it has no site assigned`);
  }
  const first = Number(rows[0].first_no);
  const siteCode = String(rows[0].site_code);
  const orchardCode = String(rows[0].orchard_code);
  return Array.from({ length: count }, (_, i) => ({
    treeId: formatTreeId(siteCode, orchardCode, first + i),
    treeNo: first + i,
  }));
}

/** The subset of a pg client these helpers need, so they compose in a transaction. */
type SqlClient = {
  query: (q: string, v?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};

/**
 * Insert a new tree, giving it a permanent id.
 *
 * The address is optional: a tree found in the field can be recorded where
 * it stands and placed in a row later. Allocation and insert share one
 * transaction so a failed insert cannot burn a tree number.
 */
export async function insertTree(treeData: TreeInsertData): Promise<Tree> {
  const {
    orchard_id,
    block_id: rawBlock,
    row_id: rawRow,
    position: rawPosition,
    lat,
    lng,
    ...otherFields
  } = treeData;

  if (!orchard_id) {
    throw new Error('Missing required field: orchard_id');
  }

  const address = normalizeAddress({
    block_id: rawBlock,
    row_id: rawRow == null ? null : String(rawRow),
    position: rawPosition == null ? null : String(rawPosition),
  });

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const occupant = await addressOccupant(client, orchard_id, address);
    if (occupant) {
      throw new Error(
        `${formatAddress(address)} is already taken by tree ${occupant}. ` +
          'Move that tree first, or pick another spot.'
      );
    }

    const [{ treeId, treeNo }] = await allocateTreeIds(client, orchard_id, 1);

    const fields: Record<string, unknown> = {
      tree_id: treeId,
      tree_no: treeNo,
      orchard_id,
      block_id: address.block_id,
      row_id: address.row_id,
      position: address.position,
      lat,
      lng,
      ...otherFields,
    };

    const cleanFields = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined)
    );

    const columns = Object.keys(cleanFields);
    const values = Object.values(cleanFields);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

    const result = await client.query(
      `INSERT INTO trees (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING *`,
      values
    );
    await client.query('COMMIT');
    return decodeTreeRow(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The tree already standing at an address, if any. Null parts compare as
 * equal (IS NOT DISTINCT FROM) so "block Upper, no row, position 5" is one
 * spot rather than a wildcard. An unplaced tree occupies nothing.
 */
async function addressOccupant(
  client: SqlClient,
  orchardId: string,
  address: TreeAddress,
  excludeTreeId?: string
): Promise<string | null> {
  const a = normalizeAddress(address);
  if (a.block_id === null && a.row_id === null && a.position === null) return null;

  const { rows } = await client.query(
    `SELECT tree_id FROM trees
      WHERE orchard_id = $1
        AND block_id IS NOT DISTINCT FROM $2
        AND row_id   IS NOT DISTINCT FROM $3
        AND position IS NOT DISTINCT FROM $4
        AND ($5::text IS NULL OR tree_id <> $5)
      LIMIT 1`,
    [orchardId, a.block_id, a.row_id, a.position, excludeTreeId ?? null]
  );
  return rows.length > 0 ? String(rows[0].tree_id) : null;
}

/**
 * Update an existing tree.
 * Returns null when no tree matches; throws on database failure.
 */
export async function updateTree(
  tree_id: string,
  updates: Partial<Omit<Tree, 'id' | 'tree_id' | 'created_at' | 'updated_at'>>
): Promise<Tree | null> {
  const update = buildUpdateSet(updates, TREE_UPDATABLE_COLUMNS);
  if (!update) return null;

  const values = [...update.values, tree_id];
  const query = `
    UPDATE trees
    SET ${update.setClause}, updated_at = CURRENT_TIMESTAMP
    WHERE tree_id = $${values.length}
    RETURNING *
  `;

  const client = await sql.connect();
  try {
    const result = await client.query(query, values);
    return result.rows.length > 0 ? decodeTreeRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/**
 * Delete a tree. Returns true when a row was removed.
 */
export async function deleteTree(tree_id: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM trees
    WHERE tree_id = ${tree_id}
  `;
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Get all trees for a specific orchard, ordered by row and position.
 */
export async function getTreesByOrchard(orchard_id: string): Promise<Tree[]> {
  const result = await sql`
    SELECT * FROM trees
    WHERE orchard_id = ${orchard_id}
    ORDER BY block_id NULLS FIRST,
      NULLIF(substring(row_id from '^\d+'), '')::int NULLS LAST,
      row_id,
      NULLIF(substring(position from '^\d+'), '')::int NULLS LAST,
      position
  `;
  return result.rows.map(decodeTreeRow);
}

/**
 * Get a single tree by its permanent id.
 *
 * Falls back to legacy_tree_id so links, bookmarks and exports made before
 * migration 049 -- when a tree's id was its address -- still resolve.
 */
export async function getTreeById(tree_id: string): Promise<Tree | null> {
  const result = await sql`
    SELECT * FROM trees
    WHERE tree_id = ${tree_id} OR legacy_tree_id = ${tree_id}
    ORDER BY (tree_id = ${tree_id}) DESC
    LIMIT 1
  `;
  return result.rows.length > 0 ? decodeTreeRow(result.rows[0]) : null;
}

/**
 * Get trees count for an orchard.
 */
export async function getTreesCount(orchard_id: string): Promise<number> {
  const result = await sql`
    SELECT COUNT(*) as count FROM trees
    WHERE orchard_id = ${orchard_id}
  `;
  return parseInt(result.rows[0].count, 10) || 0;
}

/**
 * Get trees count for all orchards.
 */
export async function getTreeCountsByOrchard(): Promise<Record<string, number>> {
  const result = await sql`
    SELECT orchard_id, COUNT(*) as count
    FROM trees
    GROUP BY orchard_id
  `;
  const counts: Record<string, number> = {};
  for (const row of result.rows) {
    counts[row.orchard_id] = parseInt(row.count, 10) || 0;
  }
  return counts;
}

const BULK_CHUNK_SIZE = 200;

/**
 * Fields a bulk upsert row may carry, with the type each one casts to.
 * Everything crosses the wire as text arrays and is cast here, so one
 * import is one round trip instead of one per tree.
 */
const BULK_UPSERT_FIELDS = {
  name: 'text',
  variety: 'text',
  fruit_type: 'text',
  status: 'text',
  planted_date: 'date',
  age: 'int',
  height: 'numeric',
  lat: 'numeric',
  lng: 'numeric',
  last_pruned: 'date',
  last_harvest: 'date',
  yield_estimate: 'numeric',
  notes: 'text',
  rootstock: 'text',
  source: 'text',
  acquired_date: 'date',
} as const;

type BulkUpsertField = keyof typeof BULK_UPSERT_FIELDS;
const BULK_UPSERT_FIELD_NAMES = Object.keys(BULK_UPSERT_FIELDS) as BulkUpsertField[];

/** Address columns a bulk row may set, in the order they are passed. */
const BULK_ADDRESS_FIELDS = ['block_id', 'row_id', 'position'] as const;

export interface BulkUpsertRow {
  /** Match an existing tree outright. Accepts a legacy (pre-049) id too. */
  tree_id?: string;
  block_id?: string | null;
  row_id?: string | null;
  position?: string | number | null;
  name?: string;
  variety?: string;
  fruit_type?: string;
  status?: string;
  planted_date?: Date | string;
  age?: number;
  height?: number;
  lat?: number;
  lng?: number;
  last_pruned?: Date | string;
  last_harvest?: Date | string;
  yield_estimate?: number;
  notes?: string;
  rootstock?: string;
  source?: string;
  acquired_date?: Date | string;
}

export interface BulkUpsertResult {
  created: number;
  updated: number;
  errors: Array<{ address: string; error: string }>;
}

function asText(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * Bulk create and update trees for one orchard, in a single transaction.
 *
 * A row matches an existing tree by tree_id when it carries one, otherwise
 * by its address. Only genuinely new trees are issued numbers -- a
 * re-import of the same orchard updates in place rather than duplicating,
 * which is what the address-derived ids made impossible before migration
 * 049, and it does not inflate the counter by re-importing.
 *
 * Incoming NULLs preserve existing values, so a sparse CSV cannot wipe
 * fields it does not mention. The address constraint is deferred for the
 * transaction, so an import that shuffles positions within the orchard
 * does not trip over itself halfway through.
 */
export async function bulkUpsertTrees(
  orchard_id: string,
  rows: BulkUpsertRow[]
): Promise<BulkUpsertResult> {
  if (rows.length === 0) return { created: 0, updated: 0, errors: [] };

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS trees_orchard_address_uniq DEFERRED');

    const { rows: existing } = await client.query(
      'SELECT tree_id, legacy_tree_id, block_id, row_id, position FROM trees WHERE orchard_id = $1',
      [orchard_id]
    );
    const idIndex = new Map<string, string>();
    const addressIndex = new Map<string, string>();
    for (const t of existing) {
      const id = String(t.tree_id);
      idIndex.set(id, id);
      if (t.legacy_tree_id) idIndex.set(String(t.legacy_tree_id), id);
      const key = addressKey(t as TreeAddress);
      if (key) addressIndex.set(key, id);
    }

    const errors: BulkUpsertResult['errors'] = [];
    const seenAddresses = new Map<string, number>();
    const updates: Array<{ treeId: string; row: BulkUpsertRow }> = [];
    const inserts: BulkUpsertRow[] = [];

    rows.forEach((row, i) => {
      const address = normalizeAddress(row as TreeAddress);
      const key = addressKey(address);
      if (key) {
        const first = seenAddresses.get(key);
        if (first !== undefined) {
          errors.push({
            address: formatAddress(address),
            error: `Two rows in this import claim the same spot (rows ${first + 1} and ${i + 1}).`,
          });
          return;
        }
        seenAddresses.set(key, i);
      }
      const match =
        (row.tree_id ? idIndex.get(row.tree_id) : undefined) ??
        (key ? addressIndex.get(key) : undefined);
      if (row.tree_id && !match) {
        errors.push({
          address: formatAddress(address),
          error: `No tree ${row.tree_id} in this orchard.`,
        });
        return;
      }
      if (match) updates.push({ treeId: match, row });
      else inserts.push(row);
    });

    if (errors.length > 0) {
      await client.query('ROLLBACK');
      return { created: 0, updated: 0, errors };
    }

    let updated = 0;
    if (updates.length > 0) {
      const columns = [...BULK_ADDRESS_FIELDS, ...BULK_UPSERT_FIELD_NAMES];
      const params: unknown[] = [updates.map((u) => u.treeId)];
      const selects = ['u.tree_id'];
      columns.forEach((col, i) => {
        const type = col in BULK_UPSERT_FIELDS
          ? BULK_UPSERT_FIELDS[col as BulkUpsertField]
          : 'text';
        params.push(
          updates.map((u) =>
            col === 'position'
              ? asText(normalizeAddress(u.row as TreeAddress).position)
              : col === 'row_id'
                ? asText(normalizeAddress(u.row as TreeAddress).row_id)
                : col === 'block_id'
                  ? asText(normalizeAddress(u.row as TreeAddress).block_id)
                  : asText((u.row as Record<string, unknown>)[col])
          )
        );
        selects.push(`u.${col}::${type} AS ${col}`);
      });

      const assignments = columns
        .map((col) => `${col} = COALESCE(u.${col}, t.${col})`)
        .join(', ');
      const unnestArgs = params.map((_, i) => `$${i + 1}::text[]`).join(', ');
      const unnestCols = ['tree_id', ...columns].join(', ');

      const result = await client.query(
        `UPDATE trees t
            SET ${assignments}, updated_at = CURRENT_TIMESTAMP
           FROM (SELECT ${selects.join(', ')}
                   FROM unnest(${unnestArgs}) AS u(${unnestCols})) u
          WHERE t.tree_id = u.tree_id`,
        params
      );
      updated = result.rowCount ?? 0;
    }

    let created = 0;
    if (inserts.length > 0) {
      const allocated = await allocateTreeIds(client, orchard_id, inserts.length);
      const columns = [
        'tree_id',
        'tree_no',
        'orchard_id',
        ...BULK_ADDRESS_FIELDS,
        ...BULK_UPSERT_FIELD_NAMES,
      ];
      for (let start = 0; start < inserts.length; start += BULK_CHUNK_SIZE) {
        const chunk = inserts.slice(start, start + BULK_CHUNK_SIZE);
        const values: unknown[] = [];
        const tuples = chunk.map((row, i) => {
          const { treeId, treeNo } = allocated[start + i];
          const address = normalizeAddress(row as TreeAddress);
          values.push(
            treeId,
            treeNo,
            orchard_id,
            address.block_id,
            address.row_id,
            address.position
          );
          for (const f of BULK_UPSERT_FIELD_NAMES) {
            values.push((row as Record<string, unknown>)[f] ?? null);
          }
          const base = i * columns.length;
          return `(${columns.map((_, j) => `$${base + j + 1}`).join(', ')})`;
        });
        const result = await client.query(
          `INSERT INTO trees (${columns.join(', ')})
           VALUES ${tuples.join(', ')}
           RETURNING tree_id`,
          values
        );
        created += result.rows.length;
      }
    }

    await client.query('COMMIT');
    return { created, updated, errors: [] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export type SetAddressResult =
  | { ok: true; treeId: string; address: string; previousAddress: string }
  | { ok: false; reason: string };

/**
 * Move a tree to a different block, row and position.
 *
 * Since migration 049 this is an ordinary column update. A tree's id is
 * permanent, so its observations, sprays, harvests and photos stay
 * attached with nothing rewritten -- where this used to have to rename the
 * tree and rewrite every table that referenced it by string.
 *
 * The address constraint is deferred for the transaction so two trees may
 * briefly share a spot mid-update, which is what makes a swap possible in
 * one step.
 */
export async function setTreeAddress(
  treeId: string,
  address: TreeAddress,
  opts: { actor?: string } = {}
): Promise<SetAddressResult> {
  const next = normalizeAddress(address);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS trees_orchard_address_uniq DEFERRED');

    const { rows: found } = await client.query(
      `SELECT tree_id, orchard_id, block_id, row_id, position
         FROM trees WHERE tree_id = $1 OR legacy_tree_id = $1
        ORDER BY (tree_id = $1) DESC
        LIMIT 1
        FOR UPDATE`,
      [treeId]
    );
    if (found.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'Tree not found.' };
    }
    const tree = found[0];
    const id = String(tree.tree_id);
    const orchardId = String(tree.orchard_id);
    const previous = normalizeAddress(tree as TreeAddress);

    if (addressKey(previous) === addressKey(next)) {
      await client.query('ROLLBACK');
      return { ok: false, reason: 'That is already this tree\u2019s address.' };
    }

    const occupant = await addressOccupant(client, orchardId, next, id);
    if (occupant) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        reason: `${formatAddress(next)} is already taken. Move that tree first, or pick another spot.`,
      };
    }

    await client.query(
      `UPDATE trees
          SET block_id = $1, row_id = $2, position = $3, updated_at = CURRENT_TIMESTAMP
        WHERE tree_id = $4`,
      [next.block_id, next.row_id, next.position, id]
    );
    await client.query('COMMIT');

    await insertTreeEvent(
      {
        tree_id: id,
        orchard_id: orchardId,
        event_type: 'moved',
        detail: `Moved from ${formatAddress(previous)} to ${formatAddress(next)}`,
        changes: {
          block_id: { from: previous.block_id, to: next.block_id },
          row_id: { from: previous.row_id, to: next.row_id },
          position: { from: previous.position, to: next.position },
        },
        created_by: opts.actor,
      },
      { bestEffort: true }
    );

    return {
      ok: true,
      treeId: id,
      address: formatAddress(next),
      previousAddress: formatAddress(previous),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
