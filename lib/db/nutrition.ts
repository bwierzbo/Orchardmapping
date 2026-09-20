import { sql } from '@vercel/postgres';
import {
  FRUIT_PURPOSES,
  NUTRIENTS,
  OPERATION_SCALES,
  type FruitPurpose,
  type Nutrient,
  type NutrientReading,
  type OperationScale,
} from '../nutrition';

/**
 * Tissue and soil results, and what the orchard is for.
 *
 * The sufficiency ranges and the interpretation live in lib/nutrition.ts
 * and are pure; this reads and writes rows.
 */

export interface OrchardIntent {
  fruitPurpose: FruitPurpose;
  operationScale: OperationScale;
}

export async function getOrchardIntent(orchardId: string): Promise<OrchardIntent> {
  const { rows } = await sql`
    SELECT fruit_purpose, operation_scale FROM orchards WHERE id = ${orchardId}`;
  const purpose = String(rows[0]?.fruit_purpose ?? 'cider');
  const scale = String(rows[0]?.operation_scale ?? 'small_business');
  return {
    fruitPurpose: (FRUIT_PURPOSES as readonly string[]).includes(purpose)
      ? (purpose as FruitPurpose)
      : 'cider',
    operationScale: (OPERATION_SCALES as readonly string[]).includes(scale)
      ? (scale as OperationScale)
      : 'small_business',
  };
}

export async function setOrchardIntent(
  orchardId: string,
  intent: Partial<OrchardIntent>
): Promise<void> {
  if (intent.fruitPurpose) {
    await sql`UPDATE orchards SET fruit_purpose = ${intent.fruitPurpose}, updated_at = NOW()
              WHERE id = ${orchardId}`;
  }
  if (intent.operationScale) {
    await sql`UPDATE orchards SET operation_scale = ${intent.operationScale}, updated_at = NOW()
              WHERE id = ${orchardId}`;
  }
}

export interface TissueTest {
  id: number;
  sampledOn: string;
  sampleArea: string | null;
  lab: string | null;
  readings: NutrientReading[];
  notes: string | null;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

export async function listTissueTests(orchardId: string): Promise<TissueTest[]> {
  const { rows } = await sql`
    SELECT id, to_char(sampled_on, 'YYYY-MM-DD') AS sampled_on, sample_area, lab,
           n, p, k, ca, mg, s, b, zn, mn, fe, cu, notes
    FROM tissue_tests
    WHERE orchard_id = ${orchardId} AND deleted_at IS NULL
    ORDER BY sampled_on DESC
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    sampledOn: String(r.sampled_on),
    sampleArea: (r.sample_area as string | null) ?? null,
    lab: (r.lab as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    readings: NUTRIENTS.map((nutrient) => ({
      nutrient,
      value: num(r[nutrient as keyof typeof r]),
    })),
  }));
}

export async function recordTissueTest(input: {
  orchardId: string;
  sampledOn: string;
  sampleArea?: string | null;
  lab?: string | null;
  values: Partial<Record<Nutrient, number | null | undefined>>;
  notes?: string | null;
  createdBy?: string | null;
}): Promise<number> {
  const v = input.values;
  const { rows } = await sql`
    INSERT INTO tissue_tests
      (orchard_id, sampled_on, sample_area, lab, n, p, k, ca, mg, s, b, zn, mn, fe, cu,
       notes, created_by)
    VALUES (
      ${input.orchardId}, ${input.sampledOn}::date, ${input.sampleArea ?? null},
      ${input.lab ?? null},
      ${v.n ?? null}, ${v.p ?? null}, ${v.k ?? null}, ${v.ca ?? null}, ${v.mg ?? null},
      ${v.s ?? null}, ${v.b ?? null}, ${v.zn ?? null}, ${v.mn ?? null}, ${v.fe ?? null},
      ${v.cu ?? null}, ${input.notes ?? null}, ${input.createdBy ?? null}
    )
    RETURNING id
  `;
  return Number(rows[0].id);
}

export interface SoilTest {
  id: number;
  sampledOn: string;
  sampleArea: string | null;
  lab: string | null;
  ph: number | null;
  organicMatterPct: number | null;
  cec: number | null;
  values: Partial<Record<'p' | 'k' | 'ca' | 'mg' | 'b' | 'zn' | 'mn' | 'cu', number | null>>;
  notes: string | null;
}

export async function listSoilTests(orchardId: string): Promise<SoilTest[]> {
  const { rows } = await sql`
    SELECT id, to_char(sampled_on, 'YYYY-MM-DD') AS sampled_on, sample_area, lab,
           ph, organic_matter_pct, cec, p, k, ca, mg, b, zn, mn, cu, notes
    FROM soil_tests
    WHERE orchard_id = ${orchardId} AND deleted_at IS NULL
    ORDER BY sampled_on DESC
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    sampledOn: String(r.sampled_on),
    sampleArea: (r.sample_area as string | null) ?? null,
    lab: (r.lab as string | null) ?? null,
    ph: num(r.ph),
    organicMatterPct: num(r.organic_matter_pct),
    cec: num(r.cec),
    notes: (r.notes as string | null) ?? null,
    values: {
      p: num(r.p), k: num(r.k), ca: num(r.ca), mg: num(r.mg),
      b: num(r.b), zn: num(r.zn), mn: num(r.mn), cu: num(r.cu),
    },
  }));
}

export async function recordSoilTest(input: {
  orchardId: string;
  sampledOn: string;
  sampleArea?: string | null;
  lab?: string | null;
  depthInches?: number | null;
  ph?: number | null;
  organicMatterPct?: number | null;
  cec?: number | null;
  nitrateN?: number | null;
  values?: Partial<Record<'p' | 'k' | 'ca' | 'mg' | 'b' | 'zn' | 'mn' | 'cu', number | null | undefined>>;
  notes?: string | null;
  createdBy?: string | null;
}): Promise<number> {
  const v = input.values ?? {};
  const { rows } = await sql`
    INSERT INTO soil_tests
      (orchard_id, sampled_on, sample_area, lab, depth_inches, ph, organic_matter_pct,
       cec, nitrate_n, p, k, ca, mg, b, zn, mn, cu, notes, created_by)
    VALUES (
      ${input.orchardId}, ${input.sampledOn}::date, ${input.sampleArea ?? null},
      ${input.lab ?? null}, ${input.depthInches ?? null}, ${input.ph ?? null},
      ${input.organicMatterPct ?? null}, ${input.cec ?? null}, ${input.nitrateN ?? null},
      ${v.p ?? null}, ${v.k ?? null}, ${v.ca ?? null}, ${v.mg ?? null},
      ${v.b ?? null}, ${v.zn ?? null}, ${v.mn ?? null}, ${v.cu ?? null},
      ${input.notes ?? null}, ${input.createdBy ?? null}
    )
    RETURNING id
  `;
  return Number(rows[0].id);
}
