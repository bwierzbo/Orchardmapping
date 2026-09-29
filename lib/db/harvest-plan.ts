/**
 * What each variety's picking window is, and who has how many of it.
 *
 * Feeds the harvest calendar. Two shapes of the same question: across every
 * orchard someone is a member of, or inside one of them.
 */
import { sql } from '@vercel/postgres';
import type { HarvestPurpose, TargetBasis } from '../harvest-target';

export interface HarvestPlanRow {
  variety: string;
  /** Null where the library has no target for this variety. */
  daysFromBloom: number | null;
  basis: TargetBasis | null;
  detail: string | null;
  /** The library's own words, kept beside anything derived from them. */
  harvestWindow: string | null;
  /** Observed full bloom for this variety this season, if a mark exists. */
  bloom: string | null;
  treeCount: number;
  orchardCount: number;
  fruitType: string | null;
}

/**
 * Varieties planted in these orchards, with their target and any recorded
 * bloom. A variety with no target still comes back -- it is planted here
 * and leaving it off the calendar would hide the gap rather than show it.
 */
export async function harvestPlan(
  orchardIds: string[],
  purpose: HarvestPurpose,
  year: number
): Promise<HarvestPlanRow[]> {
  if (orchardIds.length === 0) return [];
  const { rows } = await sql`
    WITH planted AS (
      SELECT btrim(t.variety) AS variety,
             count(*)::int AS tree_count,
             count(DISTINCT t.orchard_id)::int AS orchard_count,
             -- The commonest species recorded against the name, so a
             -- variety whose species is missing on some trees still shows.
             mode() WITHIN GROUP (ORDER BY btrim(t.fruit_type)) AS fruit_type
      FROM trees t
      WHERE t.orchard_id = ANY(${orchardIds as unknown as string})
        AND btrim(COALESCE(t.variety, '')) <> ''
      GROUP BY btrim(t.variety)
    ),
    -- A site's own target outranks the curated one, matching how the
    -- variety library resolves a name.
    target AS (
      SELECT DISTINCT ON (lower(btrim(variety)))
             lower(btrim(variety)) AS key, days_from_bloom, basis, detail
      FROM variety_harvest_targets
      WHERE purpose = ${purpose}
      ORDER BY lower(btrim(variety)), (site_id IS NULL)
    ),
    -- Full bloom recorded for this variety this season, in any of these
    -- orchards. The earliest, since a variety blooms across a few days.
    bloom AS (
      SELECT lower(btrim(variety)) AS key, min(observed_on) AS observed_on
      FROM phenology_marks
      WHERE stage = 'full_bloom'
        AND orchard_id = ANY(${orchardIds as unknown as string})
        AND date_part('year', observed_on) = ${year}
        AND btrim(COALESCE(variety, '')) <> ''
      GROUP BY lower(btrim(variety))
    ),
    library AS (
      SELECT DISTINCT ON (lower(btrim(variety)))
             lower(btrim(variety)) AS key, harvest_window
      FROM variety_attributes
      ORDER BY lower(btrim(variety)), (site_id IS NULL)
    )
    SELECT p.variety, p.tree_count, p.orchard_count, p.fruit_type,
           tg.days_from_bloom, tg.basis, tg.detail,
           lb.harvest_window, bl.observed_on
    FROM planted p
    LEFT JOIN target  tg ON tg.key = lower(p.variety)
    LEFT JOIN bloom   bl ON bl.key = lower(p.variety)
    LEFT JOIN library lb ON lb.key = lower(p.variety)
    ORDER BY tg.days_from_bloom NULLS LAST, p.variety
  `;

  return rows.map((r) => ({
    variety: String(r.variety),
    daysFromBloom: r.days_from_bloom == null ? null : Number(r.days_from_bloom),
    basis: (r.basis as TargetBasis | null) ?? null,
    detail: r.detail == null ? null : String(r.detail),
    harvestWindow: r.harvest_window == null ? null : String(r.harvest_window),
    bloom: r.observed_on == null ? null : String(r.observed_on).slice(0, 10),
    treeCount: Number(r.tree_count ?? 0),
    orchardCount: Number(r.orchard_count ?? 0),
    fruitType: r.fruit_type == null ? null : String(r.fruit_type),
  }));
}
