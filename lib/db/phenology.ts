import { sql } from '@vercel/postgres';
import {
  isPhenologyStage,
  PHENOLOGY_SCOPES,
  rollUpFromTrees,
  rollUpSuggestions,
  stageFromLabel,
  type PhenologyScope,
  type PhenologyStage,
  type TreeStageObservation,
  type VarietyRollUp,
} from '../phenology';

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
  scope: PhenologyScope;
  /** Variety or block name; null for an orchard-wide mark. */
  scopeValue: string | null;
  note: string | null;
}

function decode(row: Record<string, unknown>): PhenologyMarkRow {
  const stage = String(row.stage);
  if (!isPhenologyStage(stage)) {
    // A stage retired from the vocabulary should not crash the page it
    // appears on; it is simply no longer part of the season.
    throw new Error(`Unknown phenology stage in database: ${stage}`);
  }
  const scope = String(row.scope ?? 'orchard');
  return {
    id: Number(row.id),
    stage,
    observedOn: String(row.observed_on),
    scope: ((PHENOLOGY_SCOPES as readonly string[]).includes(scope)
      ? scope
      : 'orchard') as PhenologyScope,
    scopeValue: (row.scope_value as string | null) ?? null,
    note: (row.note as string | null) ?? null,
  };
}

/** Every mark for an orchard, oldest first. Seasons are cheap to filter in TS. */
export async function listMarks(orchardId: string): Promise<PhenologyMarkRow[]> {
  const { rows } = await sql`
    SELECT id, stage, to_char(observed_on, 'YYYY-MM-DD') AS observed_on,
           scope, scope_value, note
    FROM phenology_marks
    WHERE orchard_id = ${orchardId}
    ORDER BY observed_on, stage, scope_value
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
  scope?: PhenologyScope;
  scopeValue?: string | null;
  note?: string | null;
  createdBy?: string | null;
}): Promise<PhenologyMarkRow> {
  const scope = input.scope ?? 'orchard';
  const { rows } = await sql`
    INSERT INTO phenology_marks
      (orchard_id, stage, observed_on, scope, scope_value, note, created_by)
    VALUES (
      ${input.orchardId}, ${input.stage}, ${input.observedOn}::date,
      ${scope}, ${input.scopeValue ?? null},
      ${input.note ?? null}, ${input.createdBy ?? null}
    )
    ON CONFLICT (orchard_id, scope, COALESCE(scope_value, ''), stage,
                 (date_part('year', observed_on)))
    DO UPDATE SET
      observed_on = EXCLUDED.observed_on,
      note = EXCLUDED.note,
      updated_at = NOW()
    RETURNING id, stage, to_char(observed_on, 'YYYY-MM-DD') AS observed_on,
              scope, scope_value, note
  `;
  return decode(rows[0]);
}

/**
 * Mark a stage for everything, with exceptions.
 *
 * The common case in the field is that the whole block arrives within a
 * few days: "everything hit green tip today except Harrison and Chisel
 * Jersey, they're a week behind." Marking eighteen varieties one at a
 * time would be accurate and nobody would do it, so the default is all
 * of them and the work is in naming the stragglers.
 */
export async function markStageForAll(input: {
  orchardId: string;
  stage: PhenologyStage;
  observedOn: string;
  /** Every group to mark — usually every variety in the block. */
  groups: readonly string[];
  /** Groups on their own date, or omitted entirely when date is null. */
  exceptions?: readonly { group: string; observedOn: string | null }[];
  scope?: PhenologyScope;
  note?: string | null;
  createdBy?: string | null;
}): Promise<number> {
  const except = new Map(
    (input.exceptions ?? []).map((e) => [e.group, e.observedOn])
  );
  let written = 0;
  for (const group of input.groups) {
    const on = except.has(group) ? except.get(group)! : input.observedOn;
    // A null date means "not there yet" — skip rather than guess.
    if (on === null) continue;
    await markStage({
      orchardId: input.orchardId,
      stage: input.stage,
      observedOn: on,
      scope: input.scope ?? 'variety',
      scopeValue: group,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    });
    written += 1;
  }
  return written;
}

/** Varieties present in an orchard, for the "all, except" picker. */
export async function listVarieties(orchardId: string): Promise<string[]> {
  const { rows } = await sql`
    SELECT DISTINCT variety FROM trees
    WHERE orchard_id = ${orchardId} AND variety IS NOT NULL AND variety <> ''
    ORDER BY variety
  `;
  return rows.map((r) => String(r.variety));
}

/** Hard delete — a mis-tapped stage is noise, not history worth keeping. */
export async function unmarkStage(id: number): Promise<boolean> {
  const { rowCount } = await sql`DELETE FROM phenology_marks WHERE id = ${id}`;
  return (rowCount ?? 0) > 0;
}

/**
 * What walk mode has seen, rolled up by variety.
 *
 * Bloom stages have been recorded per tree since long before the
 * programme existed, and fed nothing — you could mark fifty trees and
 * still be told the app was waiting on green tip. Recording as you walk
 * is more natural than remembering to mark from a dashboard, so this
 * makes the walk drive the programme rather than sit beside it.
 */
export async function varietyRollUps(
  orchardId: string,
  season: number
): Promise<VarietyRollUp[]> {
  const { rows } = await sql`
    SELECT e.tree_id, t.variety, e.detail,
           to_char(e.event_date, 'YYYY-MM-DD') AS observed_on
    FROM tree_events e
    JOIN trees t ON t.tree_id = e.tree_id
    WHERE e.orchard_id = ${orchardId}
      AND e.event_type = 'bloom'
      AND e.undone_at IS NULL
      AND date_part('year', e.event_date) = ${season}
      AND t.variety IS NOT NULL
    ORDER BY e.event_date
  `;
  const observations: TreeStageObservation[] = rows.flatMap((r) => {
    const stage = stageFromLabel(String(r.detail ?? ''));
    if (!stage) return [];
    return [{
      treeId: String(r.tree_id),
      variety: String(r.variety),
      stage,
      observedOn: String(r.observed_on),
    }];
  });
  return rollUpFromTrees(observations, season);
}

/** Roll-ups the programme has not been told about yet. */
export async function pendingRollUps(
  orchardId: string,
  season: number
): Promise<VarietyRollUp[]> {
  const [rollUps, marks] = await Promise.all([
    varietyRollUps(orchardId, season),
    listMarks(orchardId),
  ]);
  return rollUpSuggestions(rollUps, marks, season);
}
