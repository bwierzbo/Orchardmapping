import { sql } from '@vercel/postgres';
import { buildUpdateSet } from './sql-helpers';
import { toNumOrUndefined } from './decode';

/**
 * Columns a client is allowed to change through updateTree.
 * Identifier keys (id, tree_id, orchard_id, timestamps) are deliberately
 * excluded; column names must never come from request data directly.
 */
export const TREE_UPDATABLE_COLUMNS = [
  'name',
  'variety',
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
] as const;

/**
 * Tree database interface
 * Matches the schema in lib/db/migrations/
 */
export interface Tree {
  id: number;
  tree_id: string;
  orchard_id: string;
  name?: string;
  variety?: string;
  status?: string;
  planted_date?: Date | string;
  block_id?: string;
  row_id?: string;
  position?: number;
  age?: number;
  height?: number;
  lat?: number;
  lng?: number;
  last_pruned?: Date | string;
  last_harvest?: Date | string;
  yield_estimate?: number;
  notes?: string;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Tree data for insertion (minimal required fields)
 */
export interface TreeInsertData {
  orchard_id: string;
  row_id: string;
  position: number;
  lat?: number;
  lng?: number;
  variety?: string;
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

/**
 * Canonical form of a row identifier: numeric rows lose leading zeros
 * ("01" -> "1") so "1" and "01" cannot address different rows while
 * generating the same padded tree_id. Non-numeric row ids pass through.
 */
export function normalizeRowId(rowId: string): string {
  const trimmed = String(rowId).trim();
  return /^\d+$/.test(trimmed) ? String(parseInt(trimmed, 10)) : trimmed;
}

/**
 * Generate tree ID from orchard, row, and position
 * Format: [ORCHARD_ID]-R[ROW_ID]-P[POSITION]
 * Example: washington-R01-P001
 */
export function generateTreeId(orchardId: string, rowId: string, position: number): string {
  const paddedRow = normalizeRowId(rowId).padStart(2, '0');
  const paddedPosition = String(position).padStart(3, '0');
  return `${orchardId}-R${paddedRow}-P${paddedPosition}`;
}

/**
 * Insert a new tree into the database
 * Auto-generates tree_id from orchard_id, row_id, and position
 */
export async function insertTree(treeData: TreeInsertData): Promise<Tree> {
  const { orchard_id, position, lat, lng, row_id: rawRowId, ...otherFields } = treeData;
  const row_id = normalizeRowId(rawRowId);

  if (!orchard_id || !row_id || position === undefined || position === null) {
    throw new Error('Missing required fields: orchard_id, row_id, and position are required');
  }

  const duplicate = await checkDuplicateRowPosition(orchard_id, row_id, position);
  if (duplicate) {
    throw new Error(
      `Tree already exists at orchard "${orchard_id}", row "${row_id}", position ${position}`
    );
  }

  const tree_id = generateTreeId(orchard_id, row_id, position);

  const fields: Record<string, unknown> = {
    tree_id,
    orchard_id,
    row_id,
    position,
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

  const query = `
    INSERT INTO trees (${columns.join(', ')})
    VALUES (${placeholders})
    RETURNING *
  `;

  const client = await sql.connect();
  try {
    const result = await client.query(query, values);
    return decodeTreeRow(result.rows[0]);
  } finally {
    client.release();
  }
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
    ORDER BY row_id, position
  `;
  return result.rows.map(decodeTreeRow);
}

/**
 * Check if a tree already exists at a specific row and position.
 */
export async function checkDuplicateRowPosition(
  orchard_id: string,
  row_id: string,
  position: number
): Promise<boolean> {
  const result = await sql`
    SELECT id FROM trees
    WHERE orchard_id = ${orchard_id}
      AND row_id = ${normalizeRowId(row_id)}
      AND position = ${position}
    LIMIT 1
  `;
  return result.rows.length > 0;
}

/**
 * Get a specific tree by orchard, row, and position.
 */
export async function getTreeByRowPosition(
  orchard_id: string,
  row_id: string,
  position: number
): Promise<Tree | null> {
  const result = await sql`
    SELECT * FROM trees
    WHERE orchard_id = ${orchard_id}
      AND row_id = ${normalizeRowId(row_id)}
      AND position = ${position}
    LIMIT 1
  `;
  return result.rows.length > 0 ? decodeTreeRow(result.rows[0]) : null;
}

/**
 * Get a single tree by its tree_id.
 */
export async function getTreeById(tree_id: string): Promise<Tree | null> {
  const result = await sql`
    SELECT * FROM trees
    WHERE tree_id = ${tree_id}
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

/** Fields a bulk upsert row may carry beyond its row/position address. */
const BULK_UPSERT_FIELDS = [
  'name',
  'variety',
  'status',
  'planted_date',
  'block_id',
  'age',
  'height',
  'lat',
  'lng',
  'last_pruned',
  'last_harvest',
  'yield_estimate',
  'notes',
] as const;

export interface BulkUpsertRow {
  row_id: string;
  position: number;
  name?: string;
  variety?: string;
  status?: string;
  planted_date?: Date | string;
  block_id?: string;
  age?: number;
  height?: number;
  lat?: number;
  lng?: number;
  last_pruned?: Date | string;
  last_harvest?: Date | string;
  yield_estimate?: number;
  notes?: string;
}

export interface BulkUpsertResult {
  created: number;
  updated: number;
  errors: Array<{ row_id: string; position: number; error: string }>;
}

const BULK_CHUNK_SIZE = 200;

/**
 * Bulk upsert trees by (orchard_id, row_id, position) in one transaction.
 *
 * Inserts rows that don't exist and updates ones that do (relies on the
 * trees_orchard_row_pos_uniq constraint from migration 003). Incoming
 * NULLs preserve existing values via COALESCE, so a sparse CSV cannot
 * wipe fields it doesn't mention. All chunks run in a single transaction:
 * any failure rolls the whole import back.
 */
export async function bulkUpsertTrees(
  orchard_id: string,
  rows: BulkUpsertRow[]
): Promise<BulkUpsertResult> {
  if (rows.length === 0) return { created: 0, updated: 0, errors: [] };

  const columns = ['tree_id', 'orchard_id', 'row_id', 'position', ...BULK_UPSERT_FIELDS];
  const updateAssignments = BULK_UPSERT_FIELDS
    .map((f) => `${f} = COALESCE(EXCLUDED.${f}, trees.${f})`)
    .join(', ');

  let created = 0;
  let updated = 0;

  const client = await sql.connect();
  try {
    await client.query('BEGIN');
    for (let start = 0; start < rows.length; start += BULK_CHUNK_SIZE) {
      const chunk = rows.slice(start, start + BULK_CHUNK_SIZE);
      const values: unknown[] = [];
      const tuples = chunk.map((row, i) => {
        const row_id = normalizeRowId(row.row_id);
        const tree_id = generateTreeId(orchard_id, row_id, row.position);
        values.push(tree_id, orchard_id, row_id, row.position);
        for (const f of BULK_UPSERT_FIELDS) values.push(row[f] ?? null);
        const base = i * columns.length;
        return `(${columns.map((_, j) => `$${base + j + 1}`).join(', ')})`;
      });

      const query = `
        INSERT INTO trees (${columns.join(', ')})
        VALUES ${tuples.join(', ')}
        ON CONFLICT (orchard_id, row_id, position) DO UPDATE
        SET ${updateAssignments}, updated_at = CURRENT_TIMESTAMP
        RETURNING (xmax = 0) AS inserted
      `;

      const result = await client.query(query, values);
      for (const r of result.rows) {
        if (r.inserted) created++;
        else updated++;
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { created, updated, errors: [] };
}
