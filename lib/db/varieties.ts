import { sql } from '@vercel/postgres';

/**
 * Variety options for the picker.
 *
 * Two sources, deliberately: the curated library, and whatever is already
 * growing in this orchard. A grower's own seedling or a local cultivar the
 * library has never heard of has to be selectable the second time as
 * easily as the first — otherwise the typo comes back.
 *
 * The library stays curated. Typing a new name uses it on the tree; it
 * does not write to variety_attributes, because a picker whose list is
 * polluted by every misspelling is the problem it was meant to solve.
 */
export interface VarietyOption {
  /** The name as it is stored on a tree. */
  name: string;
  /** Cider class, bloom group and the like — shown under the name. */
  summary: string | null;
  /** True when the curated library knows this variety. */
  inLibrary: boolean;
  /** How many trees in this orchard already carry it. */
  treeCount: number;
}

export async function listVarietyOptions(orchardId: string): Promise<VarietyOption[]> {
  const { rows } = await sql`
    WITH used AS (
      SELECT variety AS name, count(*)::int AS tree_count
      FROM trees
      WHERE orchard_id = ${orchardId} AND variety IS NOT NULL AND btrim(variety) <> ''
      GROUP BY variety
    )
    SELECT
      COALESCE(va.variety, used.name)        AS name,
      va.cider_type,
      va.bloom_group,
      va.acidity,
      va.tannin,
      va.harvest_window,
      (va.variety IS NOT NULL)               AS in_library,
      COALESCE(used.tree_count, 0)           AS tree_count
    FROM variety_attributes va
    FULL OUTER JOIN used ON lower(used.name) = lower(va.variety)
    ORDER BY 1
  `;

  return rows.map((r) => {
    // A short line of the things you actually choose between
    const bits = [
      r.cider_type as string | null,
      r.bloom_group == null ? null : `bloom ${r.bloom_group}`,
      r.tannin ? `${r.tannin} tannin` : null,
      r.acidity ? `${r.acidity} acid` : null,
      r.harvest_window as string | null,
    ].filter((b): b is string => !!b);

    const count = Number(r.tree_count ?? 0);
    if (count > 0) bits.push(`${count} here`);

    return {
      name: String(r.name),
      summary: bits.length > 0 ? bits.join(' · ') : null,
      inLibrary: Boolean(r.in_library),
      treeCount: count,
    };
  });
}
