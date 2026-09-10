import { sql } from '@vercel/postgres';
import type { HourTemp } from '../chill';
import { fetchRecentHours, nowLocalIso } from '../openmeteo';

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

/** Chunked parameterized bulk insert; duplicate hours are ignored. */
export async function insertHours(orchardId: string, hours: readonly HourTemp[]): Promise<number> {
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < hours.length; i += CHUNK) {
    const chunk = hours.slice(i, i + CHUNK);
    const values: unknown[] = [orchardId];
    const tuples = chunk.map((h, j) => {
      values.push(h.ts, h.tempC);
      return `($1, $${j * 2 + 2}::timestamp, $${j * 2 + 3}::real)`;
    });
    const res = await sql.query(
      `INSERT INTO weather_hours (orchard_id, ts, temp_c)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (orchard_id, ts) DO NOTHING`,
      values
    );
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

/** Hours in [startYmd, endYmd] (whole local days, inclusive), ascending. */
export async function getHours(
  orchardId: string,
  startYmd: string,
  endYmd: string
): Promise<HourTemp[]> {
  const { rows } = await sql`
    SELECT to_char(ts, 'YYYY-MM-DD"T"HH24:MI') AS ts, temp_c
    FROM weather_hours
    WHERE orchard_id = ${orchardId}
      AND ts >= ${`${startYmd}T00:00`}::timestamp
      AND ts < (${endYmd}::date + 1)
    ORDER BY ts
  `;
  return rows.map((r) => ({ ts: r.ts as string, tempC: Number(r.temp_c) }));
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
  asOfYmd: string
): Promise<PriorSeasonAggregates> {
  const doy = `${asOfYmd.slice(5)}`; // MM-DD
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
        SELECT CASE WHEN date_part('month', ts) >= 11
                    THEN date_part('year', ts)
                    ELSE date_part('year', ts) - 1 END AS season_year,
               ts, temp_c
        FROM weather_hours
        WHERE orchard_id = ${orchardId}
          AND temp_c >= 0 AND temp_c <= 7.222
          AND (date_part('month', ts) >= 11 OR date_part('month', ts) <= 4)
      ) h
      WHERE
        CASE WHEN ${doy} >= '11-01'
             THEN to_char(ts, 'MM-DD') <= ${doy} AND date_part('month', ts) >= 11
             ELSE date_part('month', ts) >= 11
                  OR to_char(ts, 'MM-DD') <= (CASE WHEN ${doy} > '04-30' THEN '04-30' ELSE ${doy} END)
        END
        AND season_year < (CASE WHEN ${doy} >= '11-01'
                                THEN date_part('year', ${asOfYmd}::date)
                                ELSE date_part('year', ${asOfYmd}::date) - 1 END)
        -- only seasons whose November is actually in the data — the
        -- backfill's first winter is a Jan-Apr fragment otherwise
        AND season_year IN (
          SELECT DISTINCT date_part('year', ts) FROM weather_hours
          WHERE orchard_id = ${orchardId} AND date_part('month', ts) = 11
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
    const now = nowLocalIso();
    const ageHours = (Date.parse(now) - Date.parse(latest)) / 3_600_000;
    if (ageHours < STALE_AFTER_HOURS) return 0;
    const pastDays = Math.min(92, Math.ceil(ageHours / 24) + 1);
    const hours = await fetchRecentHours(lat, lng, pastDays, now);
    const fresh = hours.filter((h) => h.ts > latest);
    if (fresh.length === 0) return 0;
    return await insertHours(orchardId, fresh);
  } catch (error) {
    console.error(`weather sync failed for ${orchardId} (serving stored data):`, error);
    return 0;
  }
}
