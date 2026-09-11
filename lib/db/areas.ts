import { sql } from '@vercel/postgres';
import type { OrchardBoundary } from '../types';
import { parseBoundary } from '../orchard-boundary';
import { buildUpdateSet } from './sql-helpers';

/**
 * Orchard area features (garden beds, berry fields, block outlines).
 * Polygons reuse the boundary validation in lib/orchard-boundary.ts.
 */

export const AREA_KINDS = ['garden', 'berries', 'block', 'building', 'area'] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

/** Columns a client may change through updateArea. */
const AREA_UPDATABLE_COLUMNS = ['name', 'kind', 'color', 'notes', 'polygon'] as const;

export interface OrchardArea {
  id: number;
  orchard_id: string;
  name: string;
  kind: string;
  color: string | null;
  notes: string | null;
  polygon: OrchardBoundary;
}

function decodeArea(row: Record<string, unknown>): OrchardArea | null {
  const polygon = parseBoundary(row.polygon);
  if (!polygon) return null; // corrupt geometry never reaches the client
  return {
    id: Number(row.id),
    orchard_id: String(row.orchard_id),
    name: String(row.name),
    kind: String(row.kind),
    color: (row.color as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    polygon,
  };
}

export async function listAreas(orchard_id: string): Promise<OrchardArea[]> {
  const { rows } = await sql`
    SELECT id, orchard_id, name, kind, color, notes, polygon
    FROM orchard_areas WHERE orchard_id = ${orchard_id} ORDER BY name
  `;
  return rows.map(decodeArea).filter((a): a is OrchardArea => a !== null);
}

export async function insertArea(input: {
  orchard_id: string;
  name: string;
  kind: string;
  color?: string;
  notes?: string;
  polygon: OrchardBoundary;
  created_by?: string;
}): Promise<OrchardArea> {
  const { rows } = await sql`
    INSERT INTO orchard_areas (orchard_id, name, kind, color, notes, polygon, created_by)
    VALUES (${input.orchard_id}, ${input.name}, ${input.kind}, ${input.color ?? null},
            ${input.notes ?? null}, ${JSON.stringify(input.polygon)}, ${input.created_by ?? null})
    RETURNING id, orchard_id, name, kind, color, notes, polygon
  `;
  const area = decodeArea(rows[0]);
  if (!area) throw new Error('Inserted area failed to decode');
  return area;
}

export async function updateArea(
  id: number,
  updates: Partial<{
    name: string;
    kind: string;
    color: string | null;
    notes: string | null;
    polygon: OrchardBoundary;
  }>
): Promise<OrchardArea | null> {
  const data: Record<string, unknown> = { ...updates };
  if (updates.polygon !== undefined) data.polygon = JSON.stringify(updates.polygon);
  const update = buildUpdateSet(data, AREA_UPDATABLE_COLUMNS);
  if (!update) return null;
  const values = [...update.values, id];
  const client = await sql.connect();
  try {
    const result = await client.query(
      `UPDATE orchard_areas SET ${update.setClause}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING id, orchard_id, name, kind, color, notes, polygon`,
      values
    );
    return result.rows.length > 0 ? decodeArea(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteArea(id: number): Promise<boolean> {
  const result = await sql`DELETE FROM orchard_areas WHERE id = ${id}`;
  return result.rowCount !== null && result.rowCount > 0;
}
