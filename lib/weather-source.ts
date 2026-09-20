import type { HourWeather } from './weather-hour';

/**
 * Merging several weather sources into one hour.
 *
 * An hour can arrive from more than one place — a station at the
 * orchard, the nearest AgWeatherNet station, a value interpolated
 * between two stations that bracket the site, and the gridded archive.
 * They are kept side by side rather than overwritten, so that two
 * sources disagreeing stays visible.
 *
 * Resolution is PER VARIABLE, not per hour. A station that measures
 * rain but carries no leaf wetness sensor should contribute its rain
 * without blanking anything else, and a gauge that fails mid-season
 * should cost its own field and nothing more. Taking the best whole row
 * would throw away good values that happen to sit beside a missing one.
 *
 * Pure: the caller fetches, this decides.
 */

export type SourceKind = 'onsite' | 'station' | 'interpolated' | 'gridded';

export interface WeatherSourceMeta {
  source: string;
  kind: SourceKind;
  label: string;
  /** Lower wins. */
  priority: number;
  /** True only where leaf wetness is MEASURED, never modelled. */
  measuresLeafWetness: boolean;
  enabled: boolean;
}

/** An hour as stored, tagged with where it came from. */
export interface SourcedHour extends HourWeather {
  source: string;
}

/** Which source supplied each field of a resolved hour. */
export interface HourProvenance {
  tempC: string | null;
  precipMm: string | null;
  rhPct: string | null;
  leafWetnessPct: string | null;
}

export interface ResolvedHour extends HourWeather {
  provenance: HourProvenance;
}

const FIELDS = ['tempC', 'precipMm', 'rhPct', 'leafWetnessPct'] as const;
type Field = (typeof FIELDS)[number];

/**
 * Collapse every source's version of an hour into one, taking each
 * field from the highest-priority source that actually has it.
 *
 * Leaf wetness is the exception worth stating: a source is only allowed
 * to supply it when it MEASURES it. Open-Meteo publishes a modelled
 * probability that tracks dew rather than rain — it read 6% on a rainy
 * December day here — so it is stored but never resolved into the field
 * a wetness model reads.
 */
export function resolveHour(
  candidates: readonly SourcedHour[],
  sources: readonly WeatherSourceMeta[]
): ResolvedHour | null {
  if (candidates.length === 0) return null;
  const meta = new Map(sources.map((s) => [s.source, s]));
  const usable = candidates
    .filter((c) => meta.get(c.source)?.enabled !== false)
    .sort((a, b) => (meta.get(a.source)?.priority ?? 999) - (meta.get(b.source)?.priority ?? 999));
  if (usable.length === 0) return null;

  const out: ResolvedHour = {
    ts: usable[0].ts,
    tempC: NaN,
    precipMm: null,
    rhPct: null,
    leafWetnessPct: null,
    provenance: { tempC: null, precipMm: null, rhPct: null, leafWetnessPct: null },
  };

  for (const field of FIELDS) {
    for (const c of usable) {
      const value = c[field as Field];
      if (value === null || value === undefined || Number.isNaN(value)) continue;
      // Only a source that measures leaf wetness may supply it.
      if (field === 'leafWetnessPct' && !meta.get(c.source)?.measuresLeafWetness) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[field] = value;
      out.provenance[field] = c.source;
      break;
    }
  }
  return Number.isNaN(out.tempC) ? null : out;
}

/** Resolve a whole run of hours, grouping by timestamp. */
export function resolveHours(
  candidates: readonly SourcedHour[],
  sources: readonly WeatherSourceMeta[]
): ResolvedHour[] {
  const byTs = new Map<string, SourcedHour[]>();
  for (const c of candidates) {
    const list = byTs.get(c.ts);
    if (list) list.push(c);
    else byTs.set(c.ts, [c]);
  }
  return [...byTs.keys()]
    .sort()
    .map((ts) => resolveHour(byTs.get(ts)!, sources))
    .filter((h): h is ResolvedHour => h !== null);
}

export interface SourceCoverage {
  source: string;
  label: string;
  hours: number;
  /** Share of resolved hours this source actually supplied, per field. */
  suppliedTemp: number;
  suppliedPrecip: number;
}

/**
 * How much of a resolved run each source actually contributed.
 *
 * A model run should be able to say how much of its input was measured
 * rather than modelled, and this is what lets it.
 */
export function sourceCoverage(
  resolved: readonly ResolvedHour[],
  sources: readonly WeatherSourceMeta[]
): SourceCoverage[] {
  const total = resolved.length || 1;
  return sources.map((s) => ({
    source: s.source,
    label: s.label,
    hours: resolved.filter((h) => Object.values(h.provenance).includes(s.source)).length,
    suppliedTemp: resolved.filter((h) => h.provenance.tempC === s.source).length / total,
    suppliedPrecip: resolved.filter((h) => h.provenance.precipMm === s.source).length / total,
  }));
}

/**
 * Interpolate an hour between two stations that bracket the site.
 *
 * `weight` is how far the orchard lies toward station B, 0 to 1. This
 * orchard sits 76% of the way from the Port Angeles station to the
 * Sequim one, at essentially Sequim's elevation.
 *
 * LINEAR IS AN ASSUMPTION, and a different one per variable. It is well
 * justified for temperature and dew point, which vary smoothly. It is
 * weaker for rainfall: a rain shadow decays roughly exponentially into
 * the lee, not linearly. It is not used for wind at all, which is
 * terrain-dominated and meaningless interpolated between two valley
 * stations. Once a season of both stations exists the relationship can
 * be FITTED rather than assumed, which is the intended replacement.
 */
export function interpolateHour(
  a: HourWeather,
  b: HourWeather,
  weight: number
): HourWeather | null {
  if (a.ts !== b.ts) return null;
  const w = Math.min(1, Math.max(0, weight));
  const mix = (x: number | null, y: number | null): number | null =>
    x === null || y === null ? null : x + (y - x) * w;
  return {
    ts: a.ts,
    tempC: a.tempC + (b.tempC - a.tempC) * w,
    precipMm: mix(a.precipMm, b.precipMm),
    rhPct: mix(a.rhPct, b.rhPct),
    // Never interpolated: a measured sensor reading belongs to the place
    // it was measured, and an average of two absent sensors is nothing.
    leafWetnessPct: null,
  };
}
