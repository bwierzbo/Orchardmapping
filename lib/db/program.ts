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

/** Active steps, in program order. */
export async function listProgramSteps(): Promise<ProgramStep[]> {
  const { rows } = await sql`
    SELECT key, title, detail, category, pest_key, material_key,
           trigger_spec, repeat_days, sort_order
    FROM program_steps
    WHERE is_active
    ORDER BY sort_order, key
  `;
  return rows.map(decode);
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
