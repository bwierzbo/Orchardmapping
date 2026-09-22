import { sql } from '@vercel/postgres';

/**
 * A region's agronomic settings.
 *
 * These are the knobs that genuinely vary by climate — the ones WSU
 * itself varies between western and central Washington. They are not a
 * program; a program is computed from them.
 */
export interface Region {
  key: string;
  name: string;
  ecoregionCode: string | null;
  ecoregionParent: string | null;
  description: string | null;
  chillStartMmdd: string;
  chillEndMmdd: string;
  /** 'jan1' is the no-biofix model, valid north of about 46 degrees. */
  cmAccumulation: 'jan1' | 'biofix';
  cmGenerations: number | null;
  scabInoculum: 'low' | 'high' | null;
  wetnessRhPct: number | null;
  wetnessPrecipMm: number | null;
  wetnessBreakHours: number | null;
  modelledLeafWetness: boolean;
  source: string | null;
  url: string | null;
  confidence: 'high' | 'medium' | 'low';
}

function decode(r: Record<string, unknown>): Region {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    key: String(r.key),
    name: String(r.name),
    ecoregionCode: (r.ecoregion_code as string | null) ?? null,
    ecoregionParent: (r.ecoregion_parent as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    chillStartMmdd: String(r.chill_start_mmdd),
    chillEndMmdd: String(r.chill_end_mmdd),
    cmAccumulation: r.cm_accumulation as Region['cmAccumulation'],
    cmGenerations: num(r.cm_generations),
    scabInoculum: (r.scab_inoculum as Region['scabInoculum']) ?? null,
    wetnessRhPct: num(r.wetness_rh_pct),
    wetnessPrecipMm: num(r.wetness_precip_mm),
    wetnessBreakHours: num(r.wetness_break_hours),
    modelledLeafWetness: Boolean(r.modelled_leaf_wetness),
    source: (r.source as string | null) ?? null,
    url: (r.url as string | null) ?? null,
    confidence: r.confidence as Region['confidence'],
  };
}

export async function listRegions(): Promise<Region[]> {
  const { rows } = await sql`SELECT * FROM regions ORDER BY name`;
  return rows.map(decode);
}

export async function getRegion(key: string): Promise<Region | null> {
  const { rows } = await sql`SELECT * FROM regions WHERE key = ${key}`;
  return rows.length > 0 ? decode(rows[0]) : null;
}

/**
 * The region an orchard belongs to, or null when nobody has chosen one.
 *
 * Null is meaningful and must not be papered over with a default: an
 * orchard with no region is one whose agronomy we cannot speak to, and
 * the program should say so rather than quietly hand it somebody else's
 * calendar.
 */
export async function orchardRegion(orchardId: string): Promise<Region | null> {
  const { rows } = await sql`
    SELECT r.* FROM orchards o
    JOIN regions r ON r.key = o.region_key
    WHERE o.id = ${orchardId}
  `;
  return rows.length > 0 ? decode(rows[0]) : null;
}

export async function setOrchardRegion(
  orchardId: string,
  regionKey: string | null
): Promise<void> {
  await sql`UPDATE orchards SET region_key = ${regionKey} WHERE id = ${orchardId}`;
}
