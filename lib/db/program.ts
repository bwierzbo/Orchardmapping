import { sql } from '@vercel/postgres';
import type { ProgramStep, StepCategory, Trigger } from '../ipm-schedule';
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
    sortOrder: Number(row.sort_order),
  };
}

/** Active steps, in program order. */
export async function listProgramSteps(): Promise<ProgramStep[]> {
  const { rows } = await sql`
    SELECT key, title, detail, category, pest_key, material_key, trigger_spec, sort_order
    FROM program_steps
    WHERE is_active
    ORDER BY sort_order, key
  `;
  return rows.map(decode);
}
