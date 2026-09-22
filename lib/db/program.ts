import { sql } from '@vercel/postgres';
import type { ProgramStep, StepCategory, StepCompletion, Trigger } from '../ipm-schedule';
import { STEP_CATEGORIES } from '../ipm-schedule';

/**
 * The program's steps. The trigger shapes and the resolver that places
 * them on a season are pure and live in lib/ipm-schedule.ts; this
 * module only reads rows and validates that what came back matches the
 * vocabulary the resolver understands.
 */

function decode(row: Record<string, unknown>): ProgramStep {
  const category = String(row.category);
  if (!(STEP_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(`Unknown program step category: ${category}`);
  }
  // trigger_spec is JSONB, so the driver has already parsed it. Its
  // shape is checked by the resolver's switch — an unknown type falls
  // through to undefined there rather than throwing here, so one bad
  // row cannot take down the whole schedule.
  return {
    key: String(row.key),
    title: String(row.title),
    detail: String(row.detail),
    category: category as StepCategory,
    pestKey: (row.pest_key as string | null) ?? null,
    materialKey: (row.material_key as string | null) ?? null,
    trigger: row.trigger_spec as Trigger,
    repeatDays: row.repeat_days == null ? null : Number(row.repeat_days),
    sortOrder: Number(row.sort_order),
  };
}

/**
 * The steps this orchard runs, in program order.
 *
 * program_steps is global — regional agronomy, the same for every
 * orchard on this coast — while whether a given orchard WANTS a step is
 * local. A missing settings row means enabled, so the override table
 * only ever holds deliberate opt-outs.
 */
/**
 * The steps this orchard is actually running.
 *
 * Its own rows, not a global calendar filtered by an opt-out list. An
 * orchard with no steps has none — which is what a new orchard in an
 * unassessed region should get, rather than somebody else's program.
 */
export async function listProgramSteps(orchardId: string): Promise<ProgramStep[]> {
  const { rows } = await sql`
    SELECT key, title, detail, category, pest_key, material_key,
           trigger_spec, repeat_days, sort_order
    FROM orchard_program_steps
    WHERE orchard_id = ${orchardId} AND enabled
    ORDER BY sort_order, key
  `;
  return rows.map(decode);
}

export interface ProgramStepChoice extends ProgramStep {
  enabled: boolean;
  /** The recommended step this came from; null when the orchard invented it. */
  sourceStepKey: string | null;
  /** The region that recommended it, at the time it was adopted. */
  recommendedBy: string | null;
  /** Changed since it was adopted, so the recommendation no longer describes it. */
  customised: boolean;
}

/** Every step with its on/off state — what the settings UI lists. */
export async function listAllProgramSteps(orchardId: string): Promise<ProgramStepChoice[]> {
  const { rows } = await sql`
    SELECT key, title, detail, category, pest_key, material_key,
           trigger_spec, repeat_days, sort_order, enabled,
           source_step_key, recommended_by, customised
    FROM orchard_program_steps
    WHERE orchard_id = ${orchardId}
    ORDER BY sort_order, key
  `;
  return rows.map((r) => ({
    ...decode(r),
    enabled: Boolean(r.enabled),
    sourceStepKey: (r.source_step_key as string | null) ?? null,
    recommendedBy: (r.recommended_by as string | null) ?? null,
    customised: Boolean(r.customised),
  }));
}

/** Turn a step on or off for one orchard. */
export async function setStepEnabled(
  orchardId: string,
  stepKey: string,
  enabled: boolean
): Promise<void> {
  await sql`
    UPDATE orchard_program_steps
    SET enabled = ${enabled}, updated_at = NOW()
    WHERE orchard_id = ${orchardId} AND key = ${stepKey}
  `;
}

/**
 * Give an orchard the program its region recommends.
 *
 * Adds steps it does not have; leaves alone every step it already has,
 * customised or not, because adopting a recommendation must never
 * silently undo a decision somebody made. Returns what it added, so the
 * caller can say so rather than claim more than it did.
 */
export async function adoptRegionProgram(orchardId: string): Promise<string[]> {
  const { rows } = await sql`
    INSERT INTO orchard_program_steps (
      orchard_id, key, source_step_key, recommended_by,
      title, detail, category, pest_key, material_key,
      trigger_spec, repeat_days, sort_order, enabled
    )
    SELECT o.id, s.key, s.key, s.region_key,
           s.title, s.detail, s.category, s.pest_key, s.material_key,
           s.trigger_spec, s.repeat_days, s.sort_order, TRUE
    FROM orchards o
    JOIN program_steps s ON s.region_key = o.region_key AND s.is_active
    WHERE o.id = ${orchardId}
    ON CONFLICT (orchard_id, key) DO NOTHING
    RETURNING key
  `;
  return rows.map((r) => String(r.key));
}

/**
 * How this orchard's program compares with what its region recommends:
 * steps it has never adopted, and steps it has changed since adopting.
 * Neither is a problem — this is for showing, not correcting.
 */
export async function programDrift(orchardId: string): Promise<{
  notAdopted: Array<{ key: string; title: string }>;
  customised: Array<{ key: string; title: string }>;
  invented: Array<{ key: string; title: string }>;
}> {
  const [missing, changed, own] = await Promise.all([
    sql`
      SELECT s.key, s.title
      FROM orchards o
      JOIN program_steps s ON s.region_key = o.region_key AND s.is_active
      LEFT JOIN orchard_program_steps ops
        ON ops.orchard_id = o.id AND ops.key = s.key
      WHERE o.id = ${orchardId} AND ops.id IS NULL
      ORDER BY s.sort_order
    `,
    sql`
      SELECT key, title FROM orchard_program_steps
      WHERE orchard_id = ${orchardId} AND customised AND source_step_key IS NOT NULL
      ORDER BY sort_order
    `,
    sql`
      SELECT key, title FROM orchard_program_steps
      WHERE orchard_id = ${orchardId} AND source_step_key IS NULL
      ORDER BY sort_order
    `,
  ]);
  const shape = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({ key: String(r.key), title: String(r.title) }));
  return {
    notAdopted: shape(missing.rows),
    customised: shape(changed.rows),
    invented: shape(own.rows),
  };
}

/**
 * Explicit completions for a season. Sprays are NOT here — those come
 * from the application record and are merged in by resolveSchedule, so
 * recording a spray never has to be done twice.
 */
export async function listCompletions(
  orchardId: string,
  season: number
): Promise<StepCompletion[]> {
  const { rows } = await sql`
    SELECT step_key, to_char(completed_on, 'YYYY-MM-DD') AS completed_on
    FROM program_step_completions
    WHERE orchard_id = ${orchardId}
      AND date_part('year', completed_on) = ${season}
    ORDER BY completed_on
  `;
  return rows.map((r) => ({
    stepKey: String(r.step_key),
    completedOn: String(r.completed_on),
  }));
}

/** Record a step as done. Twice on one day is a double-tap, not two jobs. */
export async function completeStep(input: {
  orchardId: string;
  stepKey: string;
  completedOn: string;
  note?: string | null;
  createdBy?: string | null;
}): Promise<StepCompletion> {
  const { rows } = await sql`
    INSERT INTO program_step_completions (orchard_id, step_key, completed_on, note, created_by)
    VALUES (
      ${input.orchardId}, ${input.stepKey}, ${input.completedOn}::date,
      ${input.note ?? null}, ${input.createdBy ?? null}
    )
    ON CONFLICT (orchard_id, step_key, completed_on)
    DO UPDATE SET note = EXCLUDED.note
    RETURNING step_key, to_char(completed_on, 'YYYY-MM-DD') AS completed_on
  `;
  return { stepKey: String(rows[0].step_key), completedOn: String(rows[0].completed_on) };
}

/** Undo a completion — the "I tapped that by mistake" path. */
export async function uncompleteStep(
  orchardId: string,
  stepKey: string,
  completedOn: string
): Promise<boolean> {
  const { rowCount } = await sql`
    DELETE FROM program_step_completions
    WHERE orchard_id = ${orchardId} AND step_key = ${stepKey}
      AND completed_on = ${completedOn}::date
  `;
  return (rowCount ?? 0) > 0;
}

export interface StepPatch {
  title?: string;
  detail?: string | null;
  category?: string | null;
  pestKey?: string | null;
  materialKey?: string | null;
  triggerSpec?: unknown;
  repeatDays?: number | null;
  sortOrder?: number;
  enabled?: boolean;
}

/**
 * Change one of an orchard's steps.
 *
 * Anything that came from a recommendation is marked customised the
 * moment it is changed, so the program page can keep saying what was
 * advised and where this orchard differs. Turning a step off is not a
 * customisation — it is the decision the step is there to support.
 */
export async function updateOrchardStep(
  orchardId: string,
  key: string,
  patch: StepPatch
): Promise<boolean> {
  const substantive =
    patch.title !== undefined ||
    patch.detail !== undefined ||
    patch.pestKey !== undefined ||
    patch.materialKey !== undefined ||
    patch.triggerSpec !== undefined ||
    patch.repeatDays !== undefined;

  const { rowCount } = await sql`
    UPDATE orchard_program_steps SET
      title        = COALESCE(${patch.title ?? null}, title),
      detail       = CASE WHEN ${patch.detail !== undefined} THEN ${patch.detail ?? null} ELSE detail END,
      category     = CASE WHEN ${patch.category !== undefined} THEN ${patch.category ?? null} ELSE category END,
      pest_key     = CASE WHEN ${patch.pestKey !== undefined} THEN ${patch.pestKey ?? null} ELSE pest_key END,
      material_key = CASE WHEN ${patch.materialKey !== undefined} THEN ${patch.materialKey ?? null} ELSE material_key END,
      trigger_spec = COALESCE(${patch.triggerSpec ? JSON.stringify(patch.triggerSpec) : null}::jsonb, trigger_spec),
      repeat_days  = CASE WHEN ${patch.repeatDays !== undefined} THEN ${patch.repeatDays ?? null} ELSE repeat_days END,
      sort_order   = COALESCE(${patch.sortOrder ?? null}, sort_order),
      enabled      = COALESCE(${patch.enabled ?? null}, enabled),
      customised   = customised OR (${substantive} AND source_step_key IS NOT NULL),
      updated_at   = NOW()
    WHERE orchard_id = ${orchardId} AND key = ${key}
  `;
  return (rowCount ?? 0) > 0;
}

/**
 * Remove a step from this orchard's program.
 *
 * Only from this orchard's. A recommended step deleted here stays
 * recommended, and shows up as not-adopted rather than vanishing — which
 * is how you tell "I decided against this" from "I never saw it".
 */
export async function deleteOrchardStep(orchardId: string, key: string): Promise<boolean> {
  const { rowCount } = await sql`
    DELETE FROM orchard_program_steps WHERE orchard_id = ${orchardId} AND key = ${key}
  `;
  return (rowCount ?? 0) > 0;
}

/** A step this orchard invented. No source, so nothing to be customised from. */
export async function createOrchardStep(
  orchardId: string,
  input: {
    key: string;
    title: string;
    detail?: string | null;
    category?: string | null;
    pestKey?: string | null;
    materialKey?: string | null;
    triggerSpec: unknown;
    repeatDays?: number | null;
    sortOrder?: number;
  }
): Promise<void> {
  await sql`
    INSERT INTO orchard_program_steps (
      orchard_id, key, source_step_key, recommended_by,
      title, detail, category, pest_key, material_key,
      trigger_spec, repeat_days, sort_order, enabled
    ) VALUES (
      ${orchardId}, ${input.key}, NULL, NULL,
      ${input.title}, ${input.detail ?? null}, ${input.category ?? null},
      ${input.pestKey ?? null}, ${input.materialKey ?? null},
      ${JSON.stringify(input.triggerSpec)}::jsonb, ${input.repeatDays ?? null},
      ${input.sortOrder ?? 100}, TRUE
    )
  `;
}

/** A key that is free within this orchard, derived from the title. */
export async function freeStepKey(orchardId: string, title: string): Promise<string> {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'step';
  const { rows } = await sql`
    SELECT key FROM orchard_program_steps
    WHERE orchard_id = ${orchardId} AND key LIKE ${base + '%'}
  `;
  const taken = new Set(rows.map((r) => String(r.key)));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
  throw new Error(`Could not find a free step key near "${base}"`);
}
