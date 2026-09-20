import type { HourWeather } from './weather-hour';

/**
 * Parsing what a weather station posts.
 *
 * Consumer stations do not agree on field names, so a handful of
 * spellings are accepted for each variable and everything is normalised
 * to the canonical hour. Readings are folded to the hour on arrival,
 * averaging temperature and humidity and SUMMING rain, because a
 * station reporting every minute sends sixty partial totals per hour
 * and their mean is a sixtieth of the rainfall.
 *
 * Pure, so the route stays thin and this is testable without a server.
 */

export interface StationReadingsOk {
  orchardId: string;
  hours: HourWeather[];
  /** True when at least one reading carried a leaf wetness value. */
  measuresLeafWetness: boolean;
}

export type StationReadings = StationReadingsOk | { error: string };

/** Field spellings seen across Ecowitt, Ambient and generic uploads. */
const ALIASES = {
  ts: ['ts', 'time', 'dateutc', 'datetime', 'observed_at', 'recorded_at'],
  tempF: ['tempf', 'temp_f', 'tempinf', 'outdoor_temp_f', 'air_temp_f'],
  tempC: ['tempc', 'temp_c', 'temperature', 'air_temp_c'],
  humidity: ['humidity', 'humidityin', 'rh', 'rh_pct', 'relative_humidity'],
  rainIn: ['hourlyrainin', 'rainin', 'precip_in', 'rain_in'],
  rainMm: ['rain_mm', 'precip_mm', 'precipitation'],
  leafWetness: ['leafwetness', 'leafwetness1', 'leaf_wetness', 'lw', 'lw_unity'],
} as const;

function pick(row: Record<string, unknown>, keys: readonly string[]): unknown {
  const lower = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]));
  for (const k of keys) {
    const actual = lower.get(k);
    if (actual !== undefined && row[actual] !== null && row[actual] !== '') {
      return row[actual];
    }
  }
  return undefined;
}

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Leaf wetness arrives either as a 0-1 unity value (AgWeatherNet's
 * convention, 0.4 = wet) or as a 0-100 percentage. A value at or below
 * 1 is read as unity and scaled; anything above is taken as a percent.
 */
function normaliseLeafWetness(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  return n <= 1 ? n * 100 : Math.min(100, n);
}

export function parseStationReadings(body: unknown): StationReadings {
  const b = body as { orchardId?: unknown; readings?: unknown } | null;
  const orchardId = typeof b?.orchardId === 'string' ? b.orchardId : null;
  if (!orchardId) return { error: 'orchardId is required' };
  if (!Array.isArray(b?.readings) || b.readings.length === 0) {
    return { error: 'readings must be a non-empty array' };
  }
  if (b.readings.length > 5000) {
    return { error: 'too many readings in one post — send at most 5000' };
  }

  const buckets = new Map<string, { temps: number[]; rh: number[]; rain: number[]; lw: number[] }>();
  let sawLeafWetness = false;

  for (const raw of b.readings as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object') continue;
    const tsRaw = pick(raw, ALIASES.ts);
    if (typeof tsRaw !== 'string' || tsRaw.length < 13) continue;
    // Keep the local hour; a station reports in its own local time and
    // weather_hours is local-naive by design (see migration 014).
    const ts = `${tsRaw.slice(0, 10)}T${tsRaw.slice(11, 13)}:00`;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(ts)) continue;

    const tempC =
      num(pick(raw, ALIASES.tempC)) ??
      (() => {
        const f = num(pick(raw, ALIASES.tempF));
        return f === null ? null : ((f - 32) * 5) / 9;
      })();
    if (tempC === null) continue;

    const rainMm =
      num(pick(raw, ALIASES.rainMm)) ??
      (() => {
        const i = num(pick(raw, ALIASES.rainIn));
        return i === null ? null : i * 25.4;
      })();
    const lw = normaliseLeafWetness(pick(raw, ALIASES.leafWetness));
    if (lw !== null) sawLeafWetness = true;

    const bucket = buckets.get(ts) ?? { temps: [], rh: [], rain: [], lw: [] };
    bucket.temps.push(tempC);
    const rh = num(pick(raw, ALIASES.humidity));
    if (rh !== null) bucket.rh.push(rh);
    if (rainMm !== null) bucket.rain.push(rainMm);
    if (lw !== null) bucket.lw.push(lw);
    buckets.set(ts, bucket);
  }

  if (buckets.size === 0) {
    return { error: 'no readings carried a usable timestamp and temperature' };
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b2) => a + b2, 0) / xs.length : null);
  const hours: HourWeather[] = [...buckets.keys()].sort().map((ts) => {
    const b2 = buckets.get(ts)!;
    return {
      ts,
      tempC: mean(b2.temps)!,
      // Summed, not averaged — see the note at the top.
      precipMm: b2.rain.length ? b2.rain.reduce((a, c) => a + c, 0) : null,
      rhPct: mean(b2.rh),
      leafWetnessPct: mean(b2.lw),
    };
  });

  return { orchardId, hours, measuresLeafWetness: sawLeafWetness };
}
