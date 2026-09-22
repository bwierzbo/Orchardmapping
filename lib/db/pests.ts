import { sql } from '@vercel/postgres';

/**
 * Pest & disease library plus the user's own observation log.
 *
 * Entry keys match spray_materials.targets, so "what treats this?" is a
 * join away rather than a second mapping to maintain.
 */

export type PestCategory = 'disease' | 'insect' | 'mite' | 'vertebrate' | 'beneficial';
export type Prevalence = 'high' | 'moderate' | 'low' | 'absent' | 'beneficial';

export interface PestEntry {
  key: string;
  name: string;
  scientific_name: string | null;
  category: string;
  /** How much of a problem here. Null when this region has not been assessed. */
  prevalence: string | null;
  summary: string;
  symptoms: string | null;
  lookalikes: string | null;
  lifecycle: string | null;
  timing: string | null;
  monitoring: string | null;
  management: string | null;
  cider_note: string | null;
  refs: string[];
}

export interface PestObservation {
  id: number;
  orchard_id: string;
  pest_key: string | null;
  pest_name: string | null;
  tree_id: string | null;
  photo_url: string | null;
  severity: string | null;
  observed_at: string;
  notes: string | null;
}

function decodeEntry(row: Record<string, unknown>): PestEntry {
  return {
    key: String(row.key),
    name: String(row.name),
    scientific_name: (row.scientific_name as string | null) ?? null,
    category: String(row.category),
    prevalence: row.prevalence == null ? null : String(row.prevalence),
    summary: String(row.summary),
    symptoms: (row.symptoms as string | null) ?? null,
    lookalikes: (row.lookalikes as string | null) ?? null,
    lifecycle: (row.lifecycle as string | null) ?? null,
    timing: (row.timing as string | null) ?? null,
    monitoring: (row.monitoring as string | null) ?? null,
    management: (row.management as string | null) ?? null,
    cider_note: (row.cider_note as string | null) ?? null,
    refs: (row.refs as string[] | null) ?? [],
  };
}

/**
 * The pest library, with prevalence for a given region.
 *
 * What a pest IS — biology, symptoms, lookalikes, how to monitor it — is
 * the same everywhere and comes from pest_library. How much of a problem
 * it is comes from the region, and is NULL when that region has not been
 * assessed. Null means unknown, and must not fall back to another
 * region's answer: "fire blight, absent" is true west of the Cascades and
 * dangerous in Michigan.
 */
export async function listPests(regionKey?: string | null): Promise<PestEntry[]> {
  const { rows } = await sql`
    SELECT p.key, p.name, p.scientific_name, p.category,
           rp.prevalence,
           p.summary, p.symptoms, p.lookalikes, p.lifecycle, p.timing,
           p.monitoring, p.management, p.cider_note, p.refs, p.sort_order
    FROM pest_library p
    LEFT JOIN region_pests rp
      ON rp.pest_key = p.key AND rp.region_key = ${regionKey ?? null}
    ORDER BY p.sort_order, p.name
  `;
  return rows.map(decodeEntry);
}

export async function getPest(key: string, regionKey?: string | null): Promise<PestEntry | null> {
  const { rows } = await sql`
    SELECT p.key, p.name, p.scientific_name, p.category,
           rp.prevalence,
           p.summary, p.symptoms, p.lookalikes, p.lifecycle, p.timing,
           p.monitoring, p.management, p.cider_note, p.refs, p.sort_order
    FROM pest_library p
    LEFT JOIN region_pests rp
      ON rp.pest_key = p.key AND rp.region_key = ${regionKey ?? null}
    WHERE p.key = ${key}
    LIMIT 1
  `;
  return rows[0] ? decodeEntry(rows[0]) : null;
}

function decodeObservation(row: Record<string, unknown>): PestObservation {
  return {
    id: Number(row.id),
    orchard_id: String(row.orchard_id),
    pest_key: (row.pest_key as string | null) ?? null,
    pest_name: (row.pest_name as string | null) ?? null,
    tree_id: (row.tree_id as string | null) ?? null,
    photo_url: (row.photo_url as string | null) ?? null,
    severity: (row.severity as string | null) ?? null,
    observed_at: new Date(row.observed_at as string).toISOString(),
    notes: (row.notes as string | null) ?? null,
  };
}

/** Observations for an orchard, optionally narrowed to one entry. */
export async function listObservations(
  orchardId: string,
  pestKey?: string,
): Promise<PestObservation[]> {
  const { rows } = pestKey
    ? await sql`
        SELECT o.*, l.name AS pest_name
        FROM pest_observations o
        LEFT JOIN pest_library l ON l.key = o.pest_key
        WHERE o.orchard_id = ${orchardId} AND o.pest_key = ${pestKey}
          AND o.deleted_at IS NULL
        ORDER BY o.observed_at DESC
        LIMIT 200
      `
    : await sql`
        SELECT o.*, l.name AS pest_name
        FROM pest_observations o
        LEFT JOIN pest_library l ON l.key = o.pest_key
        WHERE o.orchard_id = ${orchardId} AND o.deleted_at IS NULL
        ORDER BY o.observed_at DESC
        LIMIT 200
      `;
  return rows.map(decodeObservation);
}

export async function insertObservation(input: {
  orchardId: string;
  pestKey: string;
  treeId?: string | null;
  photoUrl?: string | null;
  severity?: string | null;
  observedAt?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}): Promise<PestObservation> {
  const { rows } = await sql`
    INSERT INTO pest_observations
      (orchard_id, pest_key, tree_id, photo_url, severity, observed_at, notes, created_by)
    VALUES (
      ${input.orchardId}, ${input.pestKey}, ${input.treeId ?? null},
      ${input.photoUrl ?? null}, ${input.severity ?? null},
      COALESCE(${input.observedAt ?? null}::timestamptz, NOW()),
      ${input.notes ?? null}, ${input.createdBy ?? null}
    )
    RETURNING *
  `;
  return decodeObservation(rows[0]);
}

export async function deleteObservation(id: number): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE pest_observations SET deleted_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
  `;
  return (rowCount ?? 0) > 0;
}

/** How many times each entry has been seen here — drives "seen in your
 *  orchard" ordering so the local picture outranks the generic one. */
export async function observationCounts(
  orchardId: string,
): Promise<Record<string, number>> {
  const { rows } = await sql`
    SELECT pest_key, COUNT(*)::int AS n
    FROM pest_observations
    WHERE orchard_id = ${orchardId} AND deleted_at IS NULL AND pest_key IS NOT NULL
    GROUP BY pest_key
  `;
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.pest_key)] = Number(r.n);
  return out;
}
