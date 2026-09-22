import { sql } from '@vercel/postgres';
import type { Nutrient, NutrientVerdict } from '../nutrition';

/**
 * What to do about a nutrient reading, if anything is recorded.
 *
 * Mirrors the IPM side deliberately: a recommendation is shown with where
 * it came from, and becomes the orchard's own program step only when
 * somebody accepts it. Nothing is scheduled behind your back.
 */
export interface NutrientAdvice {
  id: number;
  nutrient: string;
  verdict: 'deficient' | 'excessive';
  title: string;
  detail: string | null;
  materialKey: string | null;
  rateLow: number | null;
  rateHigh: number | null;
  rateUnit: string | null;
  triggerSpec: unknown | null;
  source: string | null;
  url: string | null;
  quote: string | null;
  confidence: 'high' | 'medium' | 'low';
  /** True when the advice is region-specific rather than general. */
  regional: boolean;
}

function decode(r: Record<string, unknown>): NutrientAdvice {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: Number(r.id),
    nutrient: String(r.nutrient),
    verdict: r.verdict as NutrientAdvice['verdict'],
    title: String(r.title),
    detail: (r.detail as string | null) ?? null,
    materialKey: (r.material_key as string | null) ?? null,
    rateLow: num(r.rate_low),
    rateHigh: num(r.rate_high),
    rateUnit: (r.rate_unit as string | null) ?? null,
    triggerSpec: r.trigger_spec ?? null,
    source: (r.source as string | null) ?? null,
    url: (r.url as string | null) ?? null,
    quote: (r.quote as string | null) ?? null,
    confidence: r.confidence as NutrientAdvice['confidence'],
    regional: r.region_key != null,
  };
}

/**
 * Advice for the readings that are out of range.
 *
 * Region-specific advice wins over general advice for the same nutrient,
 * the same way a site's own observation outranks a reference figure.
 * Nutrients with nothing recorded are simply absent from the result — the
 * page says so rather than this inventing a placeholder.
 */
export async function adviceFor(
  regionKey: string | null,
  readings: ReadonlyArray<{ nutrient: Nutrient; verdict: NutrientVerdict }>
): Promise<Map<string, NutrientAdvice>> {
  const wanted = readings.filter(
    (r) => r.verdict === 'deficient' || r.verdict === 'excessive'
  );
  const out = new Map<string, NutrientAdvice>();
  if (wanted.length === 0) return out;

  // The tagged template only takes primitives, so the nutrient list goes
  // through a parameterised array instead.
  const { rows } = await sql.query(
    `SELECT DISTINCT ON (nutrient, verdict) *
       FROM nutrient_recommendations
      WHERE (region_key IS NULL OR region_key = $1)
        AND nutrient = ANY($2::text[])
      ORDER BY nutrient, verdict, (region_key IS NULL)`,
    [regionKey, wanted.map((r) => r.nutrient)]
  );
  for (const row of rows.map(decode)) {
    const match = wanted.find(
      (w) => w.nutrient === row.nutrient && w.verdict === row.verdict
    );
    if (match) out.set(row.nutrient, row);
  }
  return out;
}

/** One recommendation by id, for accepting it into a program. */
export async function getNutrientAdvice(id: number): Promise<NutrientAdvice | null> {
  const { rows } = await sql`SELECT * FROM nutrient_recommendations WHERE id = ${id}`;
  return rows[0] ? decode(rows[0]) : null;
}
