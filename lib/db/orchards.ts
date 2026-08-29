import { sql } from '@vercel/postgres';
import { OrchardConfig, OrchardBounds } from '../orchards';
import { buildUpdateSet } from './sql-helpers';

/**
 * Columns a caller may change through updateOrchard. The primary key and
 * timestamps are excluded; column names must never come from request data.
 */
export const ORCHARD_UPDATABLE_COLUMNS = [
  'name',
  'location',
  'description',
  'center_lat',
  'center_lng',
  'bounds_min_lng',
  'bounds_min_lat',
  'bounds_max_lng',
  'bounds_max_lat',
  'default_zoom',
  'min_zoom',
  'max_zoom',
  'tile_min_zoom',
  'tile_max_zoom',
  'ortho_pmtiles_url',
  'vector_pmtiles_url',
  'preview_image_url',
  'ortho_api_path',
] as const;

/**
 * Orchard database interface
 * Matches the schema in lib/db/schema.sql
 */
export interface Orchard {
  id: string;
  name: string;
  location?: string;
  description?: string;
  center_lat?: number;
  center_lng?: number;
  // Geographic bounds
  bounds_min_lng?: number;
  bounds_min_lat?: number;
  bounds_max_lng?: number;
  bounds_max_lat?: number;
  // Zoom levels
  default_zoom?: number;
  min_zoom?: number;
  max_zoom?: number;
  tile_min_zoom?: number;
  tile_max_zoom?: number;
  // Tile URLs (Vercel Blob storage)
  ortho_pmtiles_url?: string;
  vector_pmtiles_url?: string;
  preview_image_url?: string;
  // Legacy: API tile path
  ortho_api_path?: string;
  // Timestamps
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
 * Full orchard data for insertion including all configuration fields
 */
export interface OrchardFullInsertData {
  id: string;
  name: string;
  location: string;
  description?: string;
  center_lat: number;
  center_lng: number;
  bounds_min_lng?: number;
  bounds_min_lat?: number;
  bounds_max_lng?: number;
  bounds_max_lat?: number;
  default_zoom?: number;
  min_zoom?: number;
  max_zoom?: number;
  tile_min_zoom?: number;
  tile_max_zoom?: number;
  ortho_pmtiles_url?: string;
  vector_pmtiles_url?: string;
  preview_image_url?: string;
  ortho_api_path?: string;
}

/**
 * Convert a database row to OrchardConfig format for use in the map component
 * Note: PostgreSQL DECIMAL types are returned as strings, so we convert them to numbers
 */
export function dbRowToOrchardConfig(row: Orchard): OrchardConfig {
  // Helper to safely convert string/number to number
  const toNum = (val: string | number | undefined | null, defaultVal: number): number => {
    if (val === undefined || val === null) return defaultVal;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? defaultVal : num;
  };

  return {
    id: row.id,
    name: row.name,
    location: row.location || '',
    description: row.description || '',
    center: [toNum(row.center_lng, 0), toNum(row.center_lat, 0)],
    bounds: {
      minLng: toNum(row.bounds_min_lng, 0),
      minLat: toNum(row.bounds_min_lat, 0),
      maxLng: toNum(row.bounds_max_lng, 0),
      maxLat: toNum(row.bounds_max_lat, 0),
    },
    defaultZoom: toNum(row.default_zoom, 18),
    minZoom: toNum(row.min_zoom, 5),
    maxZoom: toNum(row.max_zoom, 21.5),
    tileMinZoom: toNum(row.tile_min_zoom, 5),
    tileMaxZoom: toNum(row.tile_max_zoom, 23),
    orthoPath: row.ortho_api_path || '',
    orthoPmtilesPath: row.ortho_pmtiles_url || '',
    pmtilesPath: row.vector_pmtiles_url || '',
    previewImage: row.preview_image_url,
  };
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
  const update = buildUpdateSet(updates, ORCHARD_UPDATABLE_COLUMNS);
  if (!update) return null;

  const values = [...update.values, id];
  const client = await sql.connect();
  try {
    const result = await client.query(
      `UPDATE orchards SET ${update.setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length} RETURNING *`,
      values
    );
    return result.rows.length > 0 ? (result.rows[0] as Orchard) : null;
  } finally {
    client.release();
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

/**
 * Insert a new orchard with full configuration into the database
 */
export async function insertOrchardFull(data: OrchardFullInsertData): Promise<Orchard> {
  try {
    const result = await sql`
      INSERT INTO orchards (
        id, name, location, description,
        center_lat, center_lng,
        bounds_min_lng, bounds_min_lat, bounds_max_lng, bounds_max_lat,
        default_zoom, min_zoom, max_zoom, tile_min_zoom, tile_max_zoom,
        ortho_pmtiles_url, vector_pmtiles_url, preview_image_url, ortho_api_path
      ) VALUES (
        ${data.id}, ${data.name}, ${data.location}, ${data.description || null},
        ${data.center_lat}, ${data.center_lng},
        ${data.bounds_min_lng || null}, ${data.bounds_min_lat || null},
        ${data.bounds_max_lng || null}, ${data.bounds_max_lat || null},
        ${data.default_zoom || 18}, ${data.min_zoom || 5}, ${data.max_zoom || 21.5},
        ${data.tile_min_zoom || 5}, ${data.tile_max_zoom || 23},
        ${data.ortho_pmtiles_url || null}, ${data.vector_pmtiles_url || null},
        ${data.preview_image_url || null}, ${data.ortho_api_path || null}
      )
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
 * Get a single orchard by ID and return as OrchardConfig format
 */
export async function getOrchardConfigById(id: string): Promise<OrchardConfig | null> {
  try {
    const result = await sql`
      SELECT * FROM orchards WHERE id = ${id} LIMIT 1
    `;

    if (result.rows.length === 0) {
      return null;
    }

    return dbRowToOrchardConfig(result.rows[0] as Orchard);
  } catch (error) {
    console.error('Error fetching orchard config:', error);
    return null;
  }
}

/**
 * Get all orchards as OrchardConfig format
 */
export async function getAllOrchardConfigs(): Promise<OrchardConfig[]> {
  try {
    const result = await sql`
      SELECT * FROM orchards ORDER BY created_at DESC
    `;

    return result.rows.map((row) => dbRowToOrchardConfig(row as Orchard));
  } catch (error) {
    console.error('Error fetching orchard configs:', error);
    return [];
  }
}
