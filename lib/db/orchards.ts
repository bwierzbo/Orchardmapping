import { sql } from '@vercel/postgres';

/**
 * Orchard database interface
 * Matches the schema in lib/db/schema.sql
 */
export interface Orchard {
  id: string;
  name: string;
  location?: string;
  center_lat?: number;
  center_lng?: number;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Orchard data for insertion (id is required, timestamps are auto-generated)
 */
export interface OrchardInsertData {
  id: string;
  name: string;
  location: string;
  center_lat: number;
  center_lng: number;
}

/**
 * Insert a new orchard into the database
 *
 * @param orchardData - Orchard data to insert
 * @returns The created orchard object
 * @throws Error if insertion fails or orchard already exists
 *
 * @example
 * const orchard = await insertOrchard({
 *   id: 'my-orchard',
 *   name: 'My Orchard',
 *   location: 'Washington, USA',
 *   center_lat: 48.14192,
 *   center_lng: -123.16743
 * });
 */
export async function insertOrchard(orchardData: OrchardInsertData): Promise<Orchard> {
  try {
    const { id, name, location, center_lat, center_lng } = orchardData;

    // Validate required fields
    if (!id || !name || !location) {
      throw new Error('Missing required fields: id, name, and location are required');
    }

    if (center_lat === undefined || center_lng === undefined) {
      throw new Error('Missing required fields: center_lat and center_lng are required');
    }

    // Check if orchard already exists
    const exists = await orchardExists(id);
    if (exists) {
      throw new Error(`Orchard with id "${id}" already exists`);
    }

    // Insert the orchard
    const result = await sql`
      INSERT INTO orchards (id, name, location, center_lat, center_lng)
      VALUES (${id}, ${name}, ${location}, ${center_lat}, ${center_lng})
      RETURNING *
    `;

    if (result.rows.length === 0) {
      throw new Error('Failed to insert orchard - no rows returned');
    }

    return result.rows[0] as Orchard;
  } catch (error: any) {
    console.error('Error inserting orchard:', error);
    throw new Error(`Failed to insert orchard: ${error.message}`);
  }
}

/**
 * Check if an orchard with the given ID already exists in the database
 *
 * @param id - The orchard ID to check
 * @returns True if the orchard exists, false otherwise
 *
 * @example
 * const exists = await orchardExists('my-orchard');
 * if (exists) {
 *   console.log('Orchard already exists!');
 * }
 */
export async function orchardExists(id: string): Promise<boolean> {
  try {
    const result = await sql`
      SELECT id FROM orchards
      WHERE id = ${id}
      LIMIT 1
    `;

    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking orchard existence:', error);
    // In case of error, return false to be safe (let other validations catch issues)
    return false;
  }
}

/**
 * Fetch all orchards from the database
 *
 * @returns Array of orchard objects, ordered by creation date (newest first)
 *
 * @example
 * const orchards = await getAllOrchardsFromDb();
 * console.log(`Found ${orchards.length} orchards`);
 */
export async function getAllOrchardsFromDb(): Promise<Orchard[]> {
  try {
    const result = await sql`
      SELECT * FROM orchards
      ORDER BY created_at DESC
    `;

    return result.rows as Orchard[];
  } catch (error) {
    console.error('Error fetching orchards:', error);
    return [];
  }
}

/**
 * Get a single orchard by ID
 *
 * @param id - The orchard ID to fetch
 * @returns The orchard object or null if not found
 *
 * @example
 * const orchard = await getOrchardById('my-orchard');
 * if (orchard) {
 *   console.log(`Found orchard: ${orchard.name}`);
 * }
 */
export async function getOrchardById(id: string): Promise<Orchard | null> {
  try {
    const result = await sql`
      SELECT * FROM orchards
      WHERE id = ${id}
      LIMIT 1
    `;

    return result.rows.length > 0 ? (result.rows[0] as Orchard) : null;
  } catch (error) {
    console.error('Error fetching orchard:', error);
    return null;
  }
}

/**
 * Update an existing orchard's information
 *
 * @param id - The orchard ID to update
 * @param updates - Partial orchard data to update
 * @returns The updated orchard object or null if not found
 *
 * @example
 * const updated = await updateOrchard('my-orchard', {
 *   name: 'Updated Orchard Name',
 *   location: 'New Location'
 * });
 */
export async function updateOrchard(
  id: string,
  updates: Partial<Omit<Orchard, 'id' | 'created_at' | 'updated_at'>>
): Promise<Orchard | null> {
  try {
    // Filter out undefined values
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
    values.push(id); // Add id as last parameter

    // Use raw SQL query since sql template literals don't support dynamic columns
    const client = await sql.connect();
    try {
      const result = await client.query(
        `UPDATE orchards SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} RETURNING *`,
        values
      );
      return result.rows.length > 0 ? (result.rows[0] as Orchard) : null;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating orchard:', error);
    return null;
  }
}

/**
 * Delete an orchard from the database
 * Note: This will cascade delete all associated trees due to foreign key constraint
 *
 * @param id - The orchard ID to delete
 * @returns True if deletion was successful, false otherwise
 *
 * @example
 * const deleted = await deleteOrchard('my-orchard');
 * if (deleted) {
 *   console.log('Orchard deleted successfully');
 * }
 */
export async function deleteOrchard(id: string): Promise<boolean> {
  try {
    const result = await sql`
      DELETE FROM orchards
      WHERE id = ${id}
    `;

    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting orchard:', error);
    return false;
  }
}

/**
 * Get orchards count
 *
 * @returns Total number of orchards in the database
 *
 * @example
 * const count = await getOrchardsCount();
 * console.log(`Total orchards: ${count}`);
 */
export async function getOrchardsCount(): Promise<number> {
  try {
    const result = await sql`
      SELECT COUNT(*) as count FROM orchards
    `;

    return parseInt(result.rows[0].count, 10) || 0;
  } catch (error) {
    console.error('Error counting orchards:', error);
    return 0;
  }
}
