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
export async function listProgramSteps(orchardId: string): Promise<ProgramStep[]> {
  const { rows } = await sql`
    SELECT s.key, s.title, s.detail, s.category, s.pest_key, s.material_key,
           s.trigger_spec, s.repeat_days, s.sort_order
    FROM program_steps s
    LEFT JOIN orchard_step_settings o
      ON o.step_key = s.key AND o.orchard_id = ${orchardId}
    WHERE s.is_active AND COALESCE(o.enabled, TRUE)
    ORDER BY s.sort_order, s.key
  `;
  return rows.map(decode);
}

export interface ProgramStepChoice extends ProgramStep {
  enabled: boolean;
}

/** Every step with its on/off state — what the settings UI lists. */
export async function listAllProgramSteps(orchardId: string): Promise<ProgramStepChoice[]> {
  const { rows } = await sql`
    SELECT s.key, s.title, s.detail, s.category, s.pest_key, s.material_key,
           s.trigger_spec, s.repeat_days, s.sort_order,
           COALESCE(o.enabled, TRUE) AS enabled
    FROM program_steps s
    LEFT JOIN orchard_step_settings o
      ON o.step_key = s.key AND o.orchard_id = ${orchardId}
    WHERE s.is_active
    ORDER BY s.sort_order, s.key
  `;
  return rows.map((r) => ({ ...decode(r), enabled: Boolean(r.enabled) }));
}

/** Turn a step on or off for one orchard. */
export async function setStepEnabled(
  orchardId: string,
  stepKey: string,
  enabled: boolean
): Promise<void> {
  await sql`
    INSERT INTO orchard_step_settings (orchard_id, step_key, enabled)
    VALUES (${orchardId}, ${stepKey}, ${enabled})
    ON CONFLICT (orchard_id, step_key)
    DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
  `;
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
