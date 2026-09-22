import { sql } from '@vercel/postgres';
import type { ProgramMode, SprayMaterial, PriorApplication } from '../spray-rules';

/**
 * Spray/IPM persistence: the material library, the application record,
 * and the per-orchard program mode. Rules live in lib/spray-rules.ts so
 * they can be unit-tested without a database.
 */

export interface SprayApplication {
  id: number;
  orchard_id: string;
  material_id: number | null;
  material_name: string;
  material_key: string | null;
  applied_at: string;
  target: string | null;
  rate_value: number | null;
  rate_unit: string | null;
  area_description: string | null;
  applicator: string | null;
  air_temp_f: number | null;
  wind_mph: number | null;
  conditions: string | null;
  rei_hours: number | null;
  phi_days: number | null;
  notes: string | null;
  created_at: string | null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function decodeMaterial(row: Record<string, unknown>): SprayMaterial {
  return {
    id: Number(row.id),
    material_key: (row.material_key as string | null) ?? null,
    name: String(row.name),
    material_type: String(row.material_type),
    active_ingredient: (row.active_ingredient as string | null) ?? null,
    omri_listed: row.omri_listed === true,
    restricted_use: row.restricted_use === true,
    rei_hours: num(row.rei_hours),
    phi_days: num(row.phi_days),
    rate_low: num(row.rate_low),
    rate_high: num(row.rate_high),
    rate_unit: (row.rate_unit as string | null) ?? null,
    targets: (row.targets as string[] | null) ?? [],
    conflicts_with: (row.conflicts_with as string[] | null) ?? [],
    conflicts_after: (row.conflicts_after as string[] | null) ?? [],
    conflict_after_days:
      row.conflict_after_days == null ? null : Number(row.conflict_after_days),
    conflict_days: num(row.conflict_days),
    max_per_season: num(row.max_per_season),
    orchard_limit_note: (row.orchard_limit_note as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  };
}

/**
 * The material library, with this orchard's own limits applied.
 *
 * A material carries what is recommended; an orchard that runs something
 * different holds its own row. Without the orchard id you get the
 * recommendation, which is right for a general library view and wrong
 * for checking a spray — so the spray paths always pass one.
 */
export async function listMaterials(orchardId?: string): Promise<SprayMaterial[]> {
  const { rows } = await sql`
    SELECT m.*,
           CASE WHEN oms.orchard_id IS NOT NULL
                THEN oms.max_per_season ELSE m.max_per_season END AS max_per_season,
           oms.note AS orchard_limit_note
    FROM spray_materials m
    LEFT JOIN orchard_material_settings oms
      ON oms.material_key = m.material_key AND oms.orchard_id = ${orchardId ?? null}
    WHERE m.is_active = TRUE ORDER BY m.material_type, m.name
  `;
  return rows.map(decodeMaterial);
}

export async function getMaterial(id: number): Promise<SprayMaterial | null> {
  const { rows } = await sql`SELECT * FROM spray_materials WHERE id = ${id} LIMIT 1`;
  return rows[0] ? decodeMaterial(rows[0]) : null;
}

export async function getProgramMode(orchardId: string): Promise<ProgramMode> {
  const { rows } = await sql`
    SELECT spray_program_mode FROM orchards WHERE id = ${orchardId} LIMIT 1
  `;
  const mode = rows[0]?.spray_program_mode as ProgramMode | undefined;
  return mode ?? 'organic_practices';
}

export async function setProgramMode(orchardId: string, mode: ProgramMode): Promise<void> {
  await sql`
    UPDATE orchards SET spray_program_mode = ${mode}, updated_at = NOW()
    WHERE id = ${orchardId}
  `;
}

/** Recent applications, newest first — also the history the rules read. */
export async function listApplications(
  orchardId: string,
  limit = 100,
): Promise<SprayApplication[]> {
  const { rows } = await sql`
    SELECT * FROM spray_applications
    WHERE orchard_id = ${orchardId} AND deleted_at IS NULL
    ORDER BY applied_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    orchard_id: String(r.orchard_id),
    material_id: r.material_id === null ? null : Number(r.material_id),
    material_name: String(r.material_name),
    material_key: (r.material_key as string | null) ?? null,
    applied_at: new Date(r.applied_at as string).toISOString(),
    target: (r.target as string | null) ?? null,
    rate_value: num(r.rate_value),
    rate_unit: (r.rate_unit as string | null) ?? null,
    area_description: (r.area_description as string | null) ?? null,
    applicator: (r.applicator as string | null) ?? null,
    air_temp_f: num(r.air_temp_f),
    wind_mph: num(r.wind_mph),
    conditions: (r.conditions as string | null) ?? null,
    rei_hours: num(r.rei_hours),
    phi_days: num(r.phi_days),
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at ? new Date(r.created_at as string).toISOString() : null,
  }));
}

/** History in the shape the rules engine wants. */
export async function applicationHistory(
  orchardId: string,
  sinceDays = 400,
): Promise<PriorApplication[]> {
  const { rows } = await sql`
    SELECT material_key, material_name, applied_at,
           to_char(
             applied_at AT TIME ZONE
               (SELECT o.timezone FROM orchards o WHERE o.id = spray_applications.orchard_id),
             'YYYY-MM-DD'
           ) AS applied_on
    FROM spray_applications
    WHERE orchard_id = ${orchardId}
      AND deleted_at IS NULL
      AND applied_at > NOW() - (${sinceDays} || ' days')::interval
    ORDER BY applied_at DESC
  `;
  return rows.map((r) => ({
    material_key: (r.material_key as string | null) ?? null,
    material_name: String(r.material_name),
    applied_at: new Date(r.applied_at as string).toISOString(),
    applied_on: String(r.applied_on),
  }));
}

export interface NewApplication {
  orchardId: string;
  materialId: number;
  appliedAt: string;
  target?: string | null;
  rateValue?: number | null;
  rateUnit?: string | null;
  areaDescription?: string | null;
  applicator?: string | null;
  applicatorLicense?: string | null;
  airTempF?: number | null;
  windMph?: number | null;
  conditions?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

/** REI/PHI are snapshotted from the material so the record stays true
 *  even if the library row is edited or the product is reformulated. */
export async function insertApplication(input: NewApplication): Promise<SprayApplication> {
  const material = await getMaterial(input.materialId);
  if (!material) throw new Error('Material not found');
  const { rows } = await sql`
    INSERT INTO spray_applications (
      orchard_id, material_id, material_name, material_key, applied_at, target,
      rate_value, rate_unit, area_description, applicator, applicator_license,
      air_temp_f, wind_mph, conditions, rei_hours, phi_days, notes, created_by
    ) VALUES (
      ${input.orchardId}, ${material.id}, ${material.name}, ${material.material_key},
      ${input.appliedAt}, ${input.target ?? null},
      ${input.rateValue ?? null}, ${input.rateUnit ?? null},
      ${input.areaDescription ?? null}, ${input.applicator ?? null},
      ${input.applicatorLicense ?? null},
      ${input.airTempF ?? null}, ${input.windMph ?? null}, ${input.conditions ?? null},
      ${material.rei_hours}, ${material.phi_days},
      ${input.notes ?? null}, ${input.createdBy ?? null}
    )
    RETURNING *
  `;
  const r = rows[0];
  return {
    id: Number(r.id),
    orchard_id: String(r.orchard_id),
    material_id: Number(r.material_id),
    material_name: String(r.material_name),
    material_key: (r.material_key as string | null) ?? null,
    applied_at: new Date(r.applied_at as string).toISOString(),
    target: (r.target as string | null) ?? null,
    rate_value: num(r.rate_value),
    rate_unit: (r.rate_unit as string | null) ?? null,
    area_description: (r.area_description as string | null) ?? null,
    applicator: (r.applicator as string | null) ?? null,
    air_temp_f: num(r.air_temp_f),
    wind_mph: num(r.wind_mph),
    conditions: (r.conditions as string | null) ?? null,
    rei_hours: num(r.rei_hours),
    phi_days: num(r.phi_days),
    notes: (r.notes as string | null) ?? null,
    created_at: r.created_at ? new Date(r.created_at as string).toISOString() : null,
  };
}

export async function deleteApplication(id: number): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE spray_applications SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL
  `;
  return (rowCount ?? 0) > 0;
}

export interface SprayTarget {
  key: string;
  label: string;
}

/**
 * What the spray form offers as a target.
 *
 * Read from pest_library rather than a list in the component: the
 * library is the vocabulary, and a hardcoded copy drifts the moment an
 * entry is added. Narrowed to entries some material actually treats, so
 * picking one always yields recommendations — a beneficial you would
 * never spray, and fire blight, which is absent west of the Cascades
 * and has nothing listed against it, stay out of the list.
 *
 * Ordered by the library's own prevalence ranking, so what is common
 * here leads.
 */
export async function listSprayTargets(): Promise<SprayTarget[]> {
  const { rows } = await sql`
    SELECT l.key, l.name
    FROM pest_library l
    WHERE l.category <> 'beneficial'
      AND EXISTS (
        SELECT 1 FROM spray_materials m
        WHERE m.is_active AND l.key = ANY (m.targets)
      )
    ORDER BY l.sort_order, l.name
  `;
  return rows.map((r) => ({ key: String(r.key), label: String(r.name) }));
}
