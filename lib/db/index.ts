import { sql } from '@vercel/postgres';

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

export interface TreeHealthLog {
  id: number;
  tree_id: string;
  status: string;
  notes?: string;
  logged_at: Date;
  logged_by?: string;
}

// Get all trees for an orchard
export async function getTreesByOrchard(orchardId: string): Promise<Tree[]> {
  try {
    const result = await sql`
      SELECT * FROM trees
      WHERE orchard_id = ${orchardId}
      ORDER BY row_id, position
    `;
    return result.rows as Tree[];
  } catch (error) {
    console.error('Error fetching trees:', error);
    return [];
  }
}

// Get a single tree by ID
export async function getTreeById(treeId: string): Promise<Tree | null> {
  try {
    const result = await sql`
      SELECT * FROM trees
      WHERE tree_id = ${treeId}
      LIMIT 1
    `;
    return result.rows[0] as Tree || null;
  } catch (error) {
    console.error('Error fetching tree:', error);
    return null;
  }
}

// Update tree information
export async function updateTree(treeId: string, updates: Partial<Tree>): Promise<Tree | null> {
  try {
    // Filter out fields that shouldn't be updated
    const { tree_id, id, created_at, ...updateData } = updates;

    if (Object.keys(updateData).length === 0) {
      return null;
    }

    // Build the SET clause dynamically - safe because we control the keys from TypeScript
    const setClause = Object.keys(updateData)
      .map((key, i) => `${key} = $${i + 1}`)
      .join(', ');

    const values = Object.values(updateData);
    values.push(treeId); // Add tree_id as last parameter

    // Use raw SQL query since sql template literals don't support dynamic columns
    const client = await sql.connect();
    try {
      const result = await client.query(
        `UPDATE trees SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE tree_id = $${values.length} RETURNING *`,
        values
      );
      return result.rows[0] as Tree;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating tree:', error);
    return null;
  }
}

// Create or update a tree
export async function upsertTree(tree: Partial<Tree>): Promise<Tree | null> {
  try {
    if (!tree.tree_id) {
      throw new Error('tree_id is required');
    }

    // Remove undefined values
    const cleanTree = Object.fromEntries(
      Object.entries(tree).filter(([_, v]) => v !== undefined)
    );

    const columns = Object.keys(cleanTree);
    const values = Object.values(cleanTree);

    const updateFields = columns
      .filter(col => col !== 'tree_id' && col !== 'created_at')
      .map(col => `${col} = EXCLUDED.${col}`)
      .join(', ');

    const query = `
      INSERT INTO trees (${columns.join(', ')})
      VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
      ON CONFLICT (tree_id) DO UPDATE SET
        ${updateFields},
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const client = await sql.connect();
    try {
      const result = await client.query(query, values);
      return result.rows[0] as Tree;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error upserting tree:', error);
    return null;
  }
}

// Log tree health status
export async function logTreeHealth(
  treeId: string,
  status: string,
  notes?: string,
  loggedBy?: string
): Promise<TreeHealthLog | null> {
  try {
    // Also update the tree's current status
    await sql`
      UPDATE trees
      SET status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE tree_id = ${treeId}
    `;

    // Log the health status change
    const result = await sql`
      INSERT INTO tree_health_logs (tree_id, status, notes, logged_by)
      VALUES (${treeId}, ${status}, ${notes}, ${loggedBy})
      RETURNING *
    `;

    return result.rows[0] as TreeHealthLog;
  } catch (error) {
    console.error('Error logging tree health:', error);
    return null;
  }
}

// Get tree health history
export async function getTreeHealthHistory(treeId: string): Promise<TreeHealthLog[]> {
  try {
    const result = await sql`
      SELECT * FROM tree_health_logs
      WHERE tree_id = ${treeId}
      ORDER BY logged_at DESC
      LIMIT 50
    `;
    return result.rows as TreeHealthLog[];
  } catch (error) {
    console.error('Error fetching health history:', error);
    return [];
  }
}

// Initialize database schema (run this once)
export async function initializeDatabase() {
  try {
    // Read and execute the schema
    const fs = await import('fs/promises');
    const path = await import('path');
    const schemaPath = path.join(process.cwd(), 'lib/db/schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');

    // Execute the schema
    await sql.query(schema);

    console.log('Database initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing database:', error);
    return false;
  }
}