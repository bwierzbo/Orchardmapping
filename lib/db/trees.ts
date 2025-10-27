import { sql } from '@vercel/postgres';

/**
 * Tree database interface
 * Matches the schema in lib/db/schema.sql
 */
export interface Tree {
  id: number;
  tree_id: string;
  orchard_id: string;
  name?: string;
  variety?: string;
  status?: string;
  planted_date?: Date;
  block_id?: string;
  row_id?: string;
  position?: number;
  age?: number;
  height?: number;
  lat?: number;
  lng?: number;
  last_pruned?: Date;
  last_harvest?: Date;
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
  planted_date?: Date;
  age?: number;
  height?: number;
  last_pruned?: Date;
  last_harvest?: Date;
  yield_estimate?: number;
  notes?: string;
}

/**
 * Generate tree ID from orchard, row, and position
 * Format: [ORCHARD_ID]-R[ROW_ID]-P[POSITION]
 * Example: washington-R01-P001
 */
export function generateTreeId(orchardId: string, rowId: string, position: number): string {
  const paddedRow = String(rowId).padStart(2, '0');
  const paddedPosition = String(position).padStart(3, '0');
  return `${orchardId}-R${paddedRow}-P${paddedPosition}`;
}

/**
 * Insert a new tree into the database
 * Auto-generates tree_id from orchard_id, row_id, and position
 *
 * @param treeData - Tree data to insert
 * @returns The created tree object
 * @throws Error if insertion fails or duplicate row/position exists
 *
 * @example
 * const tree = await insertTree({
 *   orchard_id: 'washington',
 *   row_id: '1',
 *   position: 1,
 *   lat: 48.14192,
 *   lng: -123.16743,
 *   variety: 'Honeycrisp'
 * });
 */
export async function insertTree(treeData: TreeInsertData): Promise<Tree> {
  try {
    const { orchard_id, row_id, position, lat, lng, ...otherFields } = treeData;

    // Validate required fields
    if (!orchard_id || !row_id || position === undefined || position === null) {
      throw new Error('Missing required fields: orchard_id, row_id, and position are required');
    }

    // Check for duplicate row/position combination
    const duplicate = await checkDuplicateRowPosition(orchard_id, row_id, position);
    if (duplicate) {
      throw new Error(
        `Tree already exists at orchard "${orchard_id}", row "${row_id}", position ${position}`
      );
    }

    // Auto-generate tree_id
    const tree_id = generateTreeId(orchard_id, row_id, position);

    // Build the insert query dynamically to include only provided fields
    const fields = {
      tree_id,
      orchard_id,
      row_id,
      position,
      lat,
      lng,
      ...otherFields
    };

    // Remove undefined values
    const cleanFields = Object.fromEntries(
      Object.entries(fields).filter(([_, v]) => v !== undefined)
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
      return result.rows[0] as Tree;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error inserting tree:', error);
    throw new Error(`Failed to insert tree: ${error.message}`);
  }
}

/**
 * Update an existing tree
 *
 * @param tree_id - The tree ID to update
 * @param updates - Partial tree data to update
 * @returns The updated tree object or null if not found
 *
 * @example
 * const updated = await updateTree('washington-R01-P001', {
 *   variety: 'Fuji',
 *   status: 'healthy',
 *   yield_estimate: 150.5
 * });
 */
export async function updateTree(
  tree_id: string,
  updates: Partial<Omit<Tree, 'id' | 'tree_id' | 'created_at' | 'updated_at'>>
): Promise<Tree | null> {
  try {
    // Filter out undefined values and protected fields
    const updateData = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    if (Object.keys(updateData).length === 0) {
      return null;
    }

    // Build the SET clause dynamically
    const setClause = Object.keys(updateData)
      .map((key, i) => `${key} = $${i + 1}`)
      .join(', ');

    const values = Object.values(updateData);
    values.push(tree_id); // Add tree_id as last parameter

    const query = `
      UPDATE trees
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE tree_id = $${values.length}
      RETURNING *
    `;

    const client = await sql.connect();
    try {
      const result = await client.query(query, values);
      return result.rows.length > 0 ? (result.rows[0] as Tree) : null;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating tree:', error);
    return null;
  }
}

/**
 * Delete a tree from the database
 *
 * @param tree_id - The tree ID to delete
 * @returns True if deletion was successful, false otherwise
 *
 * @example
 * const deleted = await deleteTree('washington-R01-P001');
 * if (deleted) {
 *   console.log('Tree deleted successfully');
 * }
 */
export async function deleteTree(tree_id: string): Promise<boolean> {
  try {
    const result = await sql`
      DELETE FROM trees
      WHERE tree_id = ${tree_id}
    `;

    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting tree:', error);
    return false;
  }
}

/**
 * Get all trees for a specific orchard
 *
 * @param orchard_id - The orchard ID to fetch trees for
 * @returns Array of tree objects, ordered by row_id and position
 *
 * @example
 * const trees = await getTreesByOrchard('washington');
 * console.log(`Found ${trees.length} trees`);
 */
export async function getTreesByOrchard(orchard_id: string): Promise<Tree[]> {
  try {
    const result = await sql`
      SELECT * FROM trees
      WHERE orchard_id = ${orchard_id}
      ORDER BY row_id, position
    `;

    return result.rows as Tree[];
  } catch (error) {
    console.error('Error fetching trees:', error);
    return [];
  }
}

/**
 * Check if a tree already exists at a specific row and position
 *
 * @param orchard_id - The orchard ID
 * @param row_id - The row ID
 * @param position - The position number
 * @returns True if a duplicate exists, false otherwise
 *
 * @example
 * const isDuplicate = await checkDuplicateRowPosition('washington', '1', 5);
 * if (isDuplicate) {
 *   console.log('Tree already exists at this location');
 * }
 */
export async function checkDuplicateRowPosition(
  orchard_id: string,
  row_id: string,
  position: number
): Promise<boolean> {
  try {
    const result = await sql`
      SELECT id FROM trees
      WHERE orchard_id = ${orchard_id}
        AND row_id = ${row_id}
        AND position = ${position}
      LIMIT 1
    `;

    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking duplicate:', error);
    return false;
  }
}

/**
 * Get a specific tree by orchard, row, and position
 *
 * @param orchard_id - The orchard ID
 * @param row_id - The row ID
 * @param position - The position number
 * @returns The tree object or null if not found
 *
 * @example
 * const tree = await getTreeByRowPosition('washington', '1', 5);
 * if (tree) {
 *   console.log(`Found tree: ${tree.tree_id}`);
 * }
 */
export async function getTreeByRowPosition(
  orchard_id: string,
  row_id: string,
  position: number
): Promise<Tree | null> {
  try {
    const result = await sql`
      SELECT * FROM trees
      WHERE orchard_id = ${orchard_id}
        AND row_id = ${row_id}
        AND position = ${position}
      LIMIT 1
    `;

    return result.rows.length > 0 ? (result.rows[0] as Tree) : null;
  } catch (error) {
    console.error('Error fetching tree:', error);
    return null;
  }
}

/**
 * Get a single tree by its tree_id
 *
 * @param tree_id - The tree ID
 * @returns The tree object or null if not found
 *
 * @example
 * const tree = await getTreeById('washington-R01-P001');
 */
export async function getTreeById(tree_id: string): Promise<Tree | null> {
  try {
    const result = await sql`
      SELECT * FROM trees
      WHERE tree_id = ${tree_id}
      LIMIT 1
    `;

    return result.rows.length > 0 ? (result.rows[0] as Tree) : null;
  } catch (error) {
    console.error('Error fetching tree:', error);
    return null;
  }
}

/**
 * Get trees count for an orchard
 *
 * @param orchard_id - The orchard ID
 * @returns Total number of trees in the orchard
 *
 * @example
 * const count = await getTreesCount('washington');
 * console.log(`Orchard has ${count} trees`);
 */
export async function getTreesCount(orchard_id: string): Promise<number> {
  try {
    const result = await sql`
      SELECT COUNT(*) as count FROM trees
      WHERE orchard_id = ${orchard_id}
    `;

    return parseInt(result.rows[0].count, 10) || 0;
  } catch (error) {
    console.error('Error counting trees:', error);
    return 0;
  }
}

/**
 * Get trees count for all orchards
 *
 * @returns Record of orchard_id to tree count
 *
 * @example
 * const counts = await getTreeCountsByOrchard();
 * console.log(`Washington has ${counts['washington']} trees`);
 */
export async function getTreeCountsByOrchard(): Promise<Record<string, number>> {
  try {
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
  } catch (error) {
    console.error('Error counting trees by orchard:', error);
    return {};
  }
}

/**
 * Bulk update trees by row/position
 * Useful for updating multiple trees from CSV imports
 *
 * @param orchard_id - The orchard ID
 * @param updates - Array of updates with row_id, position, and fields to update
 * @returns Object with count of updated trees and any errors
 *
 * @example
 * const result = await bulkUpdateTrees('washington', [
 *   { row_id: '1', position: 1, variety: 'Fuji', status: 'healthy' },
 *   { row_id: '1', position: 2, variety: 'Gala', status: 'sick' }
 * ]);
 * console.log(`Updated ${result.updated} trees, ${result.errors.length} errors`);
 */
export async function bulkUpdateTrees(
  orchard_id: string,
  updates: Array<{
    row_id: string;
    position: number;
    [key: string]: any;
  }>
): Promise<{ updated: number; errors: Array<{ row_id: string; position: number; error: string }> }> {
  const errors: Array<{ row_id: string; position: number; error: string }> = [];
  let updated = 0;

  for (const update of updates) {
    try {
      const { row_id, position, ...fields } = update;

      // Find the tree
      const tree = await getTreeByRowPosition(orchard_id, row_id, position);

      if (!tree) {
        errors.push({
          row_id,
          position,
          error: `Tree not found at row ${row_id}, position ${position}`
        });
        continue;
      }

      // Update the tree
      const result = await updateTree(tree.tree_id, fields);

      if (result) {
        updated++;
      } else {
        errors.push({
          row_id,
          position,
          error: 'Update failed'
        });
      }
    } catch (error: any) {
      errors.push({
        row_id: update.row_id,
        position: update.position,
        error: error.message
      });
    }
  }

  return { updated, errors };
}
