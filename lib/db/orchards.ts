import { sql, db } from '@vercel/postgres';
import { resolveSiteForNewOrchard, nextOrchardCode } from './sites';
import { resolveTimezone } from '../openmeteo';
import { OrchardBoundary, OrchardConfig } from '../types';
import { buildUpdateSet } from './sql-helpers';
import { toNum } from './decode';
import { parseBoundary } from '../orchard-boundary';

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
  'boundary_geojson',
] as const;

/**
 * Orchard database interface
 * Matches the schema in lib/db/migrations/
 */
export interface Orchard {
  id: string;
  name: string;
  /** IANA zone, NOT NULL since migration 052. */
  timezone?: string;
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
  // Planted footprint traced from imagery (JSONB GeoJSON Polygon)
  boundary_geojson?: unknown;
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
  /** IANA zone. Resolved from the coordinates when the caller omits it. */
  timezone?: string;
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
  boundary?: OrchardBoundary;
}

/**
 * Convert a database row to OrchardConfig format for use in the map component
 * Note: PostgreSQL DECIMAL types are returned as strings, so we convert them to numbers
 */
export function dbRowToOrchardConfig(row: Orchard): OrchardConfig {
  return {
    id: row.id,
    name: row.name,
    // Pacific only as a last resort for a row written before migration 052
    timezone: row.timezone || 'America/Los_Angeles',
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
    boundary: parseBoundary(row.boundary_geojson),
  };
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
  const result = await sql`
    SELECT id FROM orchards
    WHERE id = ${id}
    LIMIT 1
  `;
  return result.rows.length > 0;
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
  const result = await sql`
    SELECT * FROM orchards
    ORDER BY created_at DESC
  `;
  return result.rows as Orchard[];
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
  const result = await sql`
    SELECT * FROM orchards
    WHERE id = ${id}
    LIMIT 1
  `;
  return result.rows.length > 0 ? (result.rows[0] as Orchard) : null;
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
  const result = await sql`
    DELETE FROM orchards
    WHERE id = ${id}
  `;
  return result.rowCount !== null && result.rowCount > 0;
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
  const result = await sql`
    SELECT COUNT(*) as count FROM orchards
  `;
  return parseInt(result.rows[0].count, 10) || 0;
}

/**
 * Insert a new orchard with full configuration into the database
 */
export async function insertOrchardFull(
  data: OrchardFullInsertData,
  ownerUserId: string
): Promise<Orchard> {
  if (!ownerUserId) {
    throw new Error('An orchard needs an owner: pass the creator’s user id');
  }

  // Resolve the clock before opening the transaction — this is a network
  // call and has no business inside one. The caller's own zone is trusted
  // first (whoever is adding an orchard is nearly always in it), then the
  // coordinates. Guessing is worse than failing: a wrong zone is silent,
  // and it would quietly shift every weather hour and spray date.
  const timezone =
    data.timezone ?? (await resolveTimezone(data.center_lat, data.center_lng));
  if (!timezone) {
    throw new Error(
      'Could not work out this orchard’s timezone. Try again, or supply one explicitly.'
    );
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // site_id and code are NOT NULL and permanent: they are baked into
    // every tree id this orchard will ever issue (migration 049).
    const siteId = await resolveSiteForNewOrchard(client, ownerUserId, data.name);
    const code = await nextOrchardCode(client, siteId);

    const result = await client.sql`
      INSERT INTO orchards (
        id, name, location, description, site_id, code, timezone,
        center_lat, center_lng,
        bounds_min_lng, bounds_min_lat, bounds_max_lng, bounds_max_lat,
        default_zoom, min_zoom, max_zoom, tile_min_zoom, tile_max_zoom,
        ortho_pmtiles_url, vector_pmtiles_url, preview_image_url, ortho_api_path,
        boundary_geojson
      ) VALUES (
        ${data.id}, ${data.name}, ${data.location}, ${data.description || null},
        ${siteId}, ${code}, ${timezone},
        ${data.center_lat}, ${data.center_lng},
        ${data.bounds_min_lng || null}, ${data.bounds_min_lat || null},
        ${data.bounds_max_lng || null}, ${data.bounds_max_lat || null},
        ${data.default_zoom || 18}, ${data.min_zoom || 5}, ${data.max_zoom || 21.5},
        ${data.tile_min_zoom || 5}, ${data.tile_max_zoom || 23},
        ${data.ortho_pmtiles_url || null}, ${data.vector_pmtiles_url || null},
        ${data.preview_image_url || null}, ${data.ortho_api_path || null},
        ${data.boundary ? JSON.stringify(data.boundary) : null}
      )
      RETURNING *
    `;

    if (result.rows.length === 0) {
      throw new Error('Failed to insert orchard - no rows returned');
    }

    // The creator is its first admin, in the same transaction that makes
    // the orchard. Membership is the only thing that grants access, so an
    // orchard created without one is invisible to everybody including the
    // person who just made it.
    await client.sql`
      INSERT INTO orchard_members (orchard_id, user_id, role)
      VALUES (${data.id}, ${ownerUserId}, 'admin')
      ON CONFLICT (orchard_id, user_id) DO NOTHING
    `;

    await client.query('COMMIT');
    return result.rows[0] as Orchard;
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error inserting orchard:', error);
    throw new Error(`Failed to insert orchard: ${error.message}`);
  } finally {
    client.release();
  }
}

/**
 * This orchard's local clock zone.
 *
 * Falls back to Pacific only if the orchard is missing entirely, which
 * callers treat as "no such orchard" anyway — better than throwing deep
 * inside a weather sync.
 */
export async function orchardTimezone(orchardId: string): Promise<string> {
  const { rows } = await sql`SELECT timezone FROM orchards WHERE id = ${orchardId} LIMIT 1`;
  return (rows[0]?.timezone as string | undefined) || 'America/Los_Angeles';
}

/**
 * Get a single orchard by ID and return as OrchardConfig format
 */
export async function getOrchardConfigById(id: string): Promise<OrchardConfig | null> {
  const result = await sql`
    SELECT * FROM orchards WHERE id = ${id} LIMIT 1
  `;
  if (result.rows.length === 0) {
    return null;
  }
  return dbRowToOrchardConfig(result.rows[0] as Orchard);
}

/**
 * Get all orchards as OrchardConfig format
 */
export async function getAllOrchardConfigs(): Promise<OrchardConfig[]> {
  const result = await sql`
    SELECT * FROM orchards ORDER BY created_at DESC
  `;
  return result.rows.map((row) => dbRowToOrchardConfig(row as Orchard));
}
