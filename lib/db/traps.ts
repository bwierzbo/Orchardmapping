import { sql } from '@vercel/postgres';
import { isTrapType, type TrapCatch, type TrapType } from '../traps';

/**
 * Traps and their counts. The trap vocabulary is pure (lib/traps.ts)
 * and the thresholds live on the program steps that act on them, so
 * nothing here decides what a count means.
 */

export interface TrapRow {
  id: number;
  trapType: TrapType;
  label: string;
  locationNote: string | null;
  /** WGS84. Null until the trap has been placed on the map. */
  lng: number | null;
  lat: number | null;
  deployedOn: string;
  removedOn: string | null;
  /** Most recent count, for the "is this trap being read?" question. */
  lastCountedOn: string | null;
  lastCount: number | null;
  /** Total caught this season. */
  seasonTotal: number;
}

function decodeTrap(row: Record<string, unknown>): TrapRow {
  const trapType = String(row.trap_type);
  if (!isTrapType(trapType)) throw new Error(`Unknown trap type in database: ${trapType}`);
  return {
    id: Number(row.id),
    trapType,
    label: String(row.label),
    locationNote: (row.location_note as string | null) ?? null,
    // NUMERIC comes back as a string — see lib/db/decode.ts
    lng: row.lng == null ? null : Number(row.lng),
    lat: row.lat == null ? null : Number(row.lat),
    deployedOn: String(row.deployed_on),
    removedOn: (row.removed_on as string | null) ?? null,
    lastCountedOn: (row.last_counted_on as string | null) ?? null,
    lastCount: row.last_count == null ? null : Number(row.last_count),
    seasonTotal: Number(row.season_total ?? 0),
  };
}

/** Traps for an orchard, with this season's totals folded in. */
export async function listTraps(orchardId: string, season: number): Promise<TrapRow[]> {
  const { rows } = await sql`
    SELECT t.id, t.trap_type, t.label, t.location_note, t.lng, t.lat,
           to_char(t.deployed_on, 'YYYY-MM-DD') AS deployed_on,
           to_char(t.removed_on, 'YYYY-MM-DD') AS removed_on,
           to_char(last.counted_on, 'YYYY-MM-DD') AS last_counted_on,
           last.count AS last_count,
           COALESCE(season.total, 0) AS season_total
    FROM traps t
    LEFT JOIN LATERAL (
      SELECT counted_on, count FROM trap_counts c
      WHERE c.trap_id = t.id ORDER BY counted_on DESC LIMIT 1
    ) last ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(count)::int AS total FROM trap_counts c
      WHERE c.trap_id = t.id AND date_part('year', c.counted_on) = ${season}
    ) season ON TRUE
    WHERE t.orchard_id = ${orchardId}
    ORDER BY t.removed_on NULLS FIRST, t.trap_type, t.label
  `;
  return rows.map(decodeTrap);
}

/**
 * This season's counts in the shape the resolver consumes. Counts are
 * per trap, not summed per type: a threshold is "N per trap", so summing
 * two traps would trip it at half the real pressure.
 */
export async function seasonCatches(orchardId: string, season: number): Promise<TrapCatch[]> {
  const { rows } = await sql`
    SELECT t.trap_type, to_char(c.counted_on, 'YYYY-MM-DD') AS counted_on, c.count
    FROM trap_counts c
    JOIN traps t ON t.id = c.trap_id
    WHERE t.orchard_id = ${orchardId}
      AND date_part('year', c.counted_on) = ${season}
    ORDER BY c.counted_on
  `;
  return rows.flatMap((r) => {
    const trapType = String(r.trap_type);
    if (!isTrapType(trapType)) return [];
    return [{ trapType, countedOn: String(r.counted_on), count: Number(r.count) }];
  });
}

export interface WeeklyCatch {
  /** Monday of the week, YYYY-MM-DD. */
  weekStart: string;
  /** Highest single-trap count that week — the number a threshold reads. */
  peakPerTrap: number;
  total: number;
}

/**
 * Weekly series per trap type, for the chart.
 *
 * Peak-per-trap rather than an average: a threshold is crossed by one
 * trap, and averaging across a quiet trap and a loaded one hides the
 * loaded one.
 */
export async function weeklyCatches(
  orchardId: string,
  trapType: TrapType,
  season: number
): Promise<WeeklyCatch[]> {
  const { rows } = await sql`
    SELECT to_char(date_trunc('week', c.counted_on), 'YYYY-MM-DD') AS week_start,
           MAX(c.count)::int AS peak_per_trap,
           SUM(c.count)::int AS total
    FROM trap_counts c
    JOIN traps t ON t.id = c.trap_id
    WHERE t.orchard_id = ${orchardId}
      AND t.trap_type = ${trapType}
      AND date_part('year', c.counted_on) = ${season}
    GROUP BY 1
    ORDER BY 1
  `;
  return rows.map((r) => ({
    weekStart: String(r.week_start),
    peakPerTrap: Number(r.peak_per_trap),
    total: Number(r.total),
  }));
}

export async function addTrap(input: {
  orchardId: string;
  trapType: TrapType;
  label: string;
  locationNote?: string | null;
  lng?: number | null;
  lat?: number | null;
  deployedOn: string;
  createdBy?: string | null;
}): Promise<number> {
  const { rows } = await sql`
    INSERT INTO traps (orchard_id, trap_type, label, location_note, lng, lat, deployed_on, created_by)
    VALUES (
      ${input.orchardId}, ${input.trapType}, ${input.label},
      ${input.locationNote ?? null}, ${input.lng ?? null}, ${input.lat ?? null},
      ${input.deployedOn}::date, ${input.createdBy ?? null}
    )
    RETURNING id
  `;
  return Number(rows[0].id);
}

/** Drop a trap on the map, or drag one that was already there. */
export async function moveTrap(id: number, lng: number, lat: number): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE traps SET lng = ${lng}, lat = ${lat}, updated_at = NOW()
    WHERE id = ${id}
  `;
  return (rowCount ?? 0) > 0;
}

/** Take a trap down — kept, not deleted, so its season stays readable. */
export async function retireTrap(id: number, removedOn: string): Promise<boolean> {
  const { rowCount } = await sql`
    UPDATE traps SET removed_on = ${removedOn}::date, updated_at = NOW()
    WHERE id = ${id} AND removed_on IS NULL
  `;
  return (rowCount ?? 0) > 0;
}

/** Record a count. Re-counting the same day corrects it. */
export async function recordCount(input: {
  trapId: number;
  countedOn: string;
  count: number;
  note?: string | null;
  createdBy?: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO trap_counts (trap_id, counted_on, count, note, created_by)
    VALUES (
      ${input.trapId}, ${input.countedOn}::date, ${input.count},
      ${input.note ?? null}, ${input.createdBy ?? null}
    )
    ON CONFLICT (trap_id, counted_on)
    DO UPDATE SET count = EXCLUDED.count, note = EXCLUDED.note
  `;
}
