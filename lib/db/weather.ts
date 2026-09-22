import { sql } from '@vercel/postgres';
import type { HourWeather } from '../weather-hour';
import {
  resolveHours,
  type SourcedHour,
  type WeatherSourceMeta,
} from '../weather-source';
import { fetchRecentHours, nowLocalIso } from '../openmeteo';
import { orchardTimezone } from './orchards';
import { MARITIME_PNW_CHILL, type ChillWindow } from '../chill';

/**
 * Storage + sync for per-orchard hourly temperatures (weather_hours).
 * Timestamps are orchard-local naive time — see migration 014.
 */

export async function latestHourTs(orchardId: string): Promise<string | null> {
  const { rows } = await sql`
    SELECT to_char(MAX(ts), 'YYYY-MM-DD"T"HH24:MI') AS max_ts
    FROM weather_hours WHERE orchard_id = ${orchardId}
  `;
  return (rows[0]?.max_ts as string | null) ?? null;
}

/**
 * Chunked parameterized bulk upsert.
 *
 * A stored hour's temperature is never overwritten — ERA5 is the same
 * value on every fetch, and treating it as immutable keeps a re-run
 * cheap to reason about. Moisture, though, fills in over NULL: rows
 * written before migration 023 have temperature only, so re-running the
 * backfill with --refetch repairs the history in place.
 *
 * Returns the number of rows inserted or updated.
 */
export async function insertHours(
  orchardId: string,
  hours: readonly HourWeather[],
  /** Which source these came from. Rows are kept side by side. */
  source = 'openmeteo'
): Promise<number> {
  const CHUNK = 500;
  const COLS = 6; // ts, temp_c, precip_mm, rh_pct, leaf_wetness_pct, source
  let written = 0;
  for (let i = 0; i < hours.length; i += CHUNK) {
    const chunk = hours.slice(i, i + CHUNK);
    const values: unknown[] = [orchardId];
    const tuples = chunk.map((h, j) => {
      values.push(h.ts, h.tempC, h.precipMm, h.rhPct, h.leafWetnessPct, source);
      const b = j * COLS + 2;
      return `($1, $${b}::timestamp, $${b + 1}::real, $${b + 2}::real, $${b + 3}::real, $${b + 4}::real, $${b + 5})`;
    });
    const res = await sql.query(
      `INSERT INTO weather_hours (orchard_id, ts, temp_c, precip_mm, rh_pct, leaf_wetness_pct, source)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (orchard_id, ts, source) DO UPDATE SET
         precip_mm        = COALESCE(weather_hours.precip_mm, EXCLUDED.precip_mm),
         rh_pct           = COALESCE(weather_hours.rh_pct, EXCLUDED.rh_pct),
         leaf_wetness_pct = COALESCE(weather_hours.leaf_wetness_pct, EXCLUDED.leaf_wetness_pct)
       WHERE weather_hours.precip_mm IS NULL
          OR weather_hours.rh_pct IS NULL
          OR weather_hours.leaf_wetness_pct IS NULL`,
      values
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

/** Hours in [startYmd, endYmd] (whole local days, inclusive), ascending. */
/** The sources serving an orchard, best first. */
export async function listWeatherSources(orchardId: string): Promise<WeatherSourceMeta[]> {
  const { rows } = await sql`
    SELECT source, kind, label, priority, measures_leaf_wetness, enabled
    FROM weather_sources WHERE orchard_id = ${orchardId}
    ORDER BY priority
  `;
  return rows.map((r) => ({
    source: String(r.source),
    kind: String(r.kind) as WeatherSourceMeta['kind'],
    label: String(r.label),
    priority: Number(r.priority),
    measuresLeafWetness: Boolean(r.measures_leaf_wetness),
    enabled: Boolean(r.enabled),
  }));
}

/**
 * Hours in [startYmd, endYmd], resolved across every source.
 *
 * Each FIELD comes from the highest-priority source that has it, so a
 * station whose rain gauge failed still supplies its temperature, and a
 * station with no leaf wetness sensor does not blank the field. See
 * lib/weather-source.ts for why that is per-field rather than per-row.
 */
export async function getHours(
  orchardId: string,
  startYmd: string,
  endYmd: string
): Promise<HourWeather[]> {
  const [{ rows }, sources] = await Promise.all([
    sql`
      SELECT to_char(ts, 'YYYY-MM-DD"T"HH24:MI') AS ts,
             temp_c, precip_mm, rh_pct, leaf_wetness_pct, source
      FROM weather_hours
      WHERE orchard_id = ${orchardId}
        AND ts >= ${`${startYmd}T00:00`}::timestamp
        AND ts < (${endYmd}::date + 1)
      ORDER BY ts
    `,
    listWeatherSources(orchardId),
  ]);

  const candidates: SourcedHour[] = rows.map((r) => ({
    ts: r.ts as string,
    tempC: Number(r.temp_c),
    precipMm: r.precip_mm == null ? null : Number(r.precip_mm),
    rhPct: r.rh_pct == null ? null : Number(r.rh_pct),
    leafWetnessPct: r.leaf_wetness_pct == null ? null : Number(r.leaf_wetness_pct),
    source: String(r.source),
  }));

  // Resolved hours carry provenance; callers that only want the weather
  // can ignore it, and it costs nothing to leave attached.
  return resolveHours(candidates, sources);
}

export interface PriorSeasonAggregates {
  /** Avg GDD (base 50, cap 88) Jan 1 → same day-of-year, prior years. */
  avgGdd: number | null;
  /** Avg chill hours (32-45°F) Nov 1 → same point in season, prior seasons. */
  avgChillHours: number | null;
  priorYears: number;
}

/**
 * SQL-side prior-season averages for the two aggregates that don't
 * need sequential computation. (Chill portions need an ordered pass,
 * so current-season portions are computed in TS; a portions-vs-average
 * comparison needs a season cache — planned follow-on.)
 */
export async function priorSeasonAggregates(
  orchardId: string,
  asOfYmd: string,
  chillWindow: ChillWindow = MARITIME_PNW_CHILL
): Promise<PriorSeasonAggregates> {
  const doy = `${asOfYmd.slice(5)}`; // MM-DD
  // The window's month bounds, so this agrees with chillSeasonWindow
  // rather than restating Nov-Apr in SQL and drifting from it.
  const startMonth = Number(chillWindow.startMmdd.slice(0, 2));
  const endMonth = Number(chillWindow.endMmdd.slice(0, 2));
  const endMmdd = chillWindow.endMmdd;
  const gdd = await sql`
    SELECT AVG(season_gdd)::float AS avg_gdd, COUNT(*)::int AS years FROM (
      SELECT date_part('year', ts) AS yr,
             SUM(GREATEST(0, LEAST(temp_c * 9.0/5 + 32, 88) - 50)) / 24 AS season_gdd
      FROM weather_hours
      WHERE orchard_id = ${orchardId}
        AND date_part('year', ts) < date_part('year', ${asOfYmd}::date)
        AND to_char(ts, 'MM-DD') <= ${doy}
      GROUP BY 1
    ) s
  `;
  // Prior chill seasons: Nov 1 of year Y through the equivalent as-of
  // point in year Y+1 (or through Nov/Dec of Y when as-of is Nov/Dec).
  const chill = await sql`
    SELECT AVG(season_hours)::float AS avg_hours, COUNT(*)::int AS years FROM (
      SELECT season_year, COUNT(*) AS season_hours FROM (
        SELECT CASE WHEN date_part('month', ts) >= ${startMonth}
                    THEN date_part('year', ts)
                    ELSE date_part('year', ts) - 1 END AS season_year,
               ts, temp_c
        FROM weather_hours
        WHERE orchard_id = ${orchardId}
          AND temp_c >= 0 AND temp_c <= 7.222
          AND (date_part('month', ts) >= ${startMonth} OR date_part('month', ts) <= ${endMonth})
      ) h
      WHERE
        CASE WHEN ${doy} >= ${chillWindow.startMmdd}
             THEN to_char(ts, 'MM-DD') <= ${doy} AND date_part('month', ts) >= ${startMonth}
             ELSE date_part('month', ts) >= ${startMonth}
                  OR to_char(ts, 'MM-DD') <= (CASE WHEN ${doy} > ${endMmdd} THEN ${endMmdd} ELSE ${doy} END)
        END
        AND season_year < (CASE WHEN ${doy} >= ${chillWindow.startMmdd}
                                THEN date_part('year', ${asOfYmd}::date)
                                ELSE date_part('year', ${asOfYmd}::date) - 1 END)
        -- only seasons whose November is actually in the data — the
        -- backfill's first winter is a Jan-Apr fragment otherwise
        AND season_year IN (
          SELECT DISTINCT date_part('year', ts) FROM weather_hours
          WHERE orchard_id = ${orchardId} AND date_part('month', ts) = ${startMonth}
        )
      GROUP BY season_year
    ) s
  `;
  return {
    avgGdd: gdd.rows[0]?.avg_gdd != null ? Number(gdd.rows[0].avg_gdd) : null,
    avgChillHours: chill.rows[0]?.avg_hours != null ? Number(chill.rows[0].avg_hours) : null,
    priorYears: Number(gdd.rows[0]?.years ?? 0),
  };
}

const STALE_AFTER_HOURS = 6;

/**
 * Top up recent hours from Open-Meteo when the newest stored hour is
 * older than STALE_AFTER_HOURS. Never throws — dashboard rendering
 * must survive a weather-API outage on whatever data is stored.
 * Returns the number of hours inserted. Does nothing when the orchard
 * has no history at all (run scripts/backfill-weather.ts first).
 */
export async function ensureWeatherCurrent(
  orchardId: string,
  lat: number,
  lng: number
): Promise<number> {
  try {
    const latest = await latestHourTs(orchardId);
    if (!latest) return 0;
    const timezone = await orchardTimezone(orchardId);
    const now = nowLocalIso(timezone);
    const ageHours = (Date.parse(now) - Date.parse(latest)) / 3_600_000;
    if (ageHours < STALE_AFTER_HOURS) return 0;
    const pastDays = Math.min(92, Math.ceil(ageHours / 24) + 1);
    const hours = await fetchRecentHours(lat, lng, pastDays, now, timezone);
    const fresh = hours.filter((h) => h.ts > latest);
    if (fresh.length === 0) return 0;
    return await insertHours(orchardId, fresh);
  } catch (error) {
    console.error(`weather sync failed for ${orchardId} (serving stored data):`, error);
    return 0;
  }
}
