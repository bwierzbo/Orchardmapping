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
    WITH site AS (
      SELECT site_id FROM orchards WHERE id = ${orchardId}
    ),
    -- The curated layer plus this site's own names. DISTINCT ON keeps one
    -- row per name, preferring the site's version over the curated one so
    -- a grower's own note about a variety wins on their own ground.
    visible AS (
      SELECT DISTINCT ON (lower(va.variety))
             va.variety, va.fruit_type, va.cider_type, va.bloom_group,
             va.acidity, va.tannin, va.harvest_window, va.site_id
      FROM variety_attributes va
      WHERE va.site_id IS NULL
         OR va.site_id = (SELECT site_id FROM site)
      ORDER BY lower(va.variety), (va.site_id IS NULL)
    ),
    used AS (
      SELECT variety AS name, count(*)::int AS tree_count
      FROM trees
      WHERE orchard_id = ${orchardId} AND variety IS NOT NULL AND btrim(variety) <> ''
      GROUP BY variety
    )
    SELECT
      COALESCE(v.variety, used.name)  AS name,
      v.fruit_type,
      v.cider_type,
      v.bloom_group,
      v.acidity,
      v.tannin,
      v.harvest_window,
      (v.variety IS NOT NULL)         AS known,
      (v.site_id IS NOT NULL)         AS site_local,
      COALESCE(used.tree_count, 0)    AS tree_count
    FROM visible v
    FULL OUTER JOIN used ON lower(used.name) = lower(v.variety)
    ORDER BY 1
  `;

  return rows.map((r) => {
    // A short line of the things you actually choose between
    const bits = [
      r.fruit_type && r.fruit_type !== 'apple' ? String(r.fruit_type) : null,
      r.cider_type as string | null,
      r.bloom_group == null ? null : `bloom ${r.bloom_group}`,
      r.tannin ? `${r.tannin} tannin` : null,
      r.acidity ? `${r.acidity} acid` : null,
      r.harvest_window as string | null,
    ].filter((b): b is string => !!b);

    const count = Number(r.tree_count ?? 0);
    if (count > 0) bits.push(`${count} here`);
    if (r.site_local) bits.push('your own record');

    return {
      name: String(r.name),
      summary: bits.length > 0 ? bits.join(' · ') : null,
      inLibrary: Boolean(r.known),
      treeCount: count,
    };
  });
}

/**
 * Fruit types to offer, in this orchard.
 *
 * Whatever is already planted here, plus a common set — so a grower who
 * has one medlar sees "medlar" the second time without retyping it, and
 * a grower who has none still gets sensible suggestions. The hardcoded
 * list this replaces had drifted: it offered fig and apricot while the
 * orchards actually held hazelnut, huckleberry and gooseberry.
 */
const COMMON_FRUIT_TYPES = [
  'apple',
  'pear',
  'quince',
  'medlar',
  'plum',
  'cherry',
  'peach',
  'apricot',
  'fig',
  'persimmon',
  'pomegranate',
  'hazelnut',
  'walnut',
  'blueberry',
  'raspberry',
  'blackberry',
  'currant',
  'gooseberry',
  'huckleberry',
] as const;

export async function listFruitTypes(orchardId: string): Promise<string[]> {
  const { rows } = await sql`
    SELECT DISTINCT btrim(fruit_type) AS fruit_type
    FROM trees
    WHERE orchard_id = ${orchardId} AND btrim(COALESCE(fruit_type, '')) <> ''
  `;
  const used = rows.map((r) => String(r.fruit_type));
  const seen = new Set(used.map((f) => f.toLowerCase()));
  return [...used.sort(), ...COMMON_FRUIT_TYPES.filter((f) => !seen.has(f))];
}

/** A measurement of a variety's juice, with where it came from. */
export interface VarietyObservation {
  scopeKind: 'trial' | 'region' | 'site';
  scopeValue: string;
  seasonFrom: number | null;
  seasonTo: number | null;
  tanninPct: number | null;
  tanninMethod: string | null;
  acidPct: number | null;
  ph: number | null;
  sg: number | null;
  brix: number | null;
  source: string | null;
  url: string | null;
  note: string | null;
}

/**
 * Measured juice for a variety, most specific scope first.
 *
 * Your own ground outranks your region, which outranks somebody else's
 * trial. That order is the point: the reader should meet the most
 * relevant evidence before the most authoritative-sounding.
 */
export async function listVarietyObservations(variety: string): Promise<VarietyObservation[]> {
  const { rows } = await sql`
    SELECT scope_kind, scope_value, season_from, season_to,
           tannin_pct, tannin_method, acid_pct, ph, sg, brix, source, url, note
    FROM variety_observations
    WHERE lower(variety) = ${variety.toLowerCase()}
    ORDER BY CASE scope_kind WHEN 'site' THEN 0 WHEN 'region' THEN 1 ELSE 2 END,
             season_to DESC NULLS LAST
  `;
  const num = (v: unknown) => (v == null ? null : Number(v));
  return rows.map((r) => ({
    scopeKind: r.scope_kind as VarietyObservation['scopeKind'],
    scopeValue: String(r.scope_value),
    seasonFrom: num(r.season_from),
    seasonTo: num(r.season_to),
    tanninPct: num(r.tannin_pct),
    tanninMethod: (r.tannin_method as string | null) ?? null,
    acidPct: num(r.acid_pct),
    ph: num(r.ph),
    sg: num(r.sg),
    brix: num(r.brix),
    source: (r.source as string | null) ?? null,
    url: (r.url as string | null) ?? null,
    note: (r.note as string | null) ?? null,
  }));
}

/** Sites growing this variety, so a page can say "and no juice recorded yet". */
export async function sitesGrowing(variety: string): Promise<Array<{ site: string; trees: number }>> {
  const { rows } = await sql`
    SELECT COALESCE(s.name, o.site_id) AS site, count(*)::int AS trees
    FROM trees t
    JOIN orchards o ON o.id = t.orchard_id
    LEFT JOIN sites s ON s.id = o.site_id
    WHERE lower(t.variety) = ${variety.toLowerCase()}
    GROUP BY 1
    ORDER BY trees DESC
  `;
  return rows.map((r) => ({ site: String(r.site), trees: Number(r.trees) }));
}
