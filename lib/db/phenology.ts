import { sql } from '@vercel/postgres';
import { isPhenologyStage, type PhenologyStage } from '../phenology';

/**
 * Growth-stage marks for an orchard. The domain logic — ordering, what
 * stage we are in, what is still ahead — is pure and lives in
 * lib/phenology.ts; this module only reads and writes rows.
 */

export interface PhenologyMarkRow {
  id: number;
  stage: PhenologyStage;
  /** Local YYYY-MM-DD. */
  observedOn: string;
  note: string | null;
}

function decode(row: Record<string, unknown>): PhenologyMarkRow {
  const stage = String(row.stage);
  if (!isPhenologyStage(stage)) {
    // A stage retired from the vocabulary should not crash the page it
    // appears on; it is simply no longer part of the season.
    throw new Error(`Unknown phenology stage in database: ${stage}`);
  }
  return {
    id: Number(row.id),
    stage,
    observedOn: String(row.observed_on),
    note: (row.note as string | null) ?? null,
  };
}

/** Every mark for an orchard, oldest first. Seasons are cheap to filter in TS. */
export async function listMarks(orchardId: string): Promise<PhenologyMarkRow[]> {
  const { rows } = await sql`
    SELECT id, stage, to_char(observed_on, 'YYYY-MM-DD') AS observed_on, note
    FROM phenology_marks
    WHERE orchard_id = ${orchardId}
    ORDER BY observed_on, stage
  `;
  return rows.map(decode);
}

/**
 * Record (or correct) the date the orchard reached a stage. One row per
 * stage per season, so re-marking a stage moves its date instead of
 * leaving two contradictory ones behind.
 */
export async function markStage(input: {
  orchardId: string;
  stage: PhenologyStage;
  observedOn: string;
  note?: string | null;
  createdBy?: string | null;
}): Promise<PhenologyMarkRow> {
  const { rows } = await sql`
    INSERT INTO phenology_marks (orchard_id, stage, observed_on, note, created_by)
    VALUES (
      ${input.orchardId}, ${input.stage}, ${input.observedOn}::date,
      ${input.note ?? null}, ${input.createdBy ?? null}
    )
    ON CONFLICT (orchard_id, stage, (date_part('year', observed_on)))
    DO UPDATE SET
      observed_on = EXCLUDED.observed_on,
      note = EXCLUDED.note,
      updated_at = NOW()
    RETURNING id, stage, to_char(observed_on, 'YYYY-MM-DD') AS observed_on, note
  `;
  return decode(rows[0]);
}

/** Hard delete — a mis-tapped stage is noise, not history worth keeping. */
export async function unmarkStage(id: number): Promise<boolean> {
  const { rowCount } = await sql`DELETE FROM phenology_marks WHERE id = ${id}`;
  return (rowCount ?? 0) > 0;
}
