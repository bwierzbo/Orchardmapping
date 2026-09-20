import { sql } from '@vercel/postgres';
import { POSTURES, type PestPosture, type Posture } from '../posture';

/**
 * Per-orchard posture. The rules about what a posture requires of a
 * material are pure and live in lib/posture.ts; this reads and writes
 * rows.
 *
 * A missing row means the pest has no posture set, which is a different
 * state from 'off': one is undecided, the other is decided.
 */

function decode(row: Record<string, unknown>): PestPosture {
  const posture = String(row.posture);
  if (!(POSTURES as readonly string[]).includes(posture)) {
    throw new Error(`Unknown posture in database: ${posture}`);
  }
  const min = String(row.min_severity);
  return {
    pestKey: String(row.pest_key),
    posture: posture as Posture,
    minSeverity: (['light', 'moderate', 'severe'].includes(min)
      ? min
      : 'moderate') as PestPosture['minSeverity'],
  };
}

export interface PestPostureRow extends PestPosture {
  note: string | null;
  updatedAt: string | null;
}

export async function listPostures(orchardId: string): Promise<PestPostureRow[]> {
  const { rows } = await sql`
    SELECT pest_key, posture, min_severity, note,
           to_char(updated_at, 'YYYY-MM-DD') AS updated_at
    FROM orchard_pest_posture
    WHERE orchard_id = ${orchardId}
    ORDER BY pest_key
  `;
  return rows.map((r) => ({
    ...decode(r),
    note: (r.note as string | null) ?? null,
    updatedAt: (r.updated_at as string | null) ?? null,
  }));
}

export async function setPosture(input: {
  orchardId: string;
  pestKey: string;
  posture: Posture;
  minSeverity?: PestPosture['minSeverity'];
  note?: string | null;
  updatedBy?: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO orchard_pest_posture
      (orchard_id, pest_key, posture, min_severity, note, updated_by)
    VALUES (
      ${input.orchardId}, ${input.pestKey}, ${input.posture},
      ${input.minSeverity ?? 'moderate'}, ${input.note ?? null}, ${input.updatedBy ?? null}
    )
    ON CONFLICT (orchard_id, pest_key) DO UPDATE SET
      posture = EXCLUDED.posture,
      min_severity = EXCLUDED.min_severity,
      note = EXCLUDED.note,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `;
}

/** Clear a posture, returning the pest to undecided. */
export async function clearPosture(orchardId: string, pestKey: string): Promise<boolean> {
  const { rowCount } = await sql`
    DELETE FROM orchard_pest_posture
    WHERE orchard_id = ${orchardId} AND pest_key = ${pestKey}
  `;
  return (rowCount ?? 0) > 0;
}

export interface MaterialKickback {
  materialKey: string;
  postInfectionHours: number | null;
}

/** Which materials can be used after an infection has started. */
export async function listMaterialKickback(): Promise<MaterialKickback[]> {
  const { rows } = await sql`
    SELECT material_key, post_infection_hours
    FROM spray_materials
    WHERE material_key IS NOT NULL AND is_active
    ORDER BY material_key
  `;
  return rows.map((r) => ({
    materialKey: String(r.material_key),
    postInfectionHours:
      r.post_infection_hours == null ? null : Number(r.post_infection_hours),
  }));
}
