import type { HourWeather } from './weather-hour';
import { cToF } from './gdd';

/**
 * Apple scab infection periods, by the revised Mills table.
 *
 * An infection needs the leaves to stay WET for long enough at a given
 * temperature. Cooler means longer: around 8 hours at 60°F, more than a
 * day near freezing. The table below is the revised Mills relationship
 * (MacHardy & Gadoury) as it appears in extension guidance.
 *
 * WHAT THIS IS NOT. RIMpro and NEWA model ascospore maturity and
 * discharge — how many spores are actually available on a given date —
 * and score each event for severity on that basis. This does not. It
 * answers "were the conditions sufficient for infection", which is the
 * older and coarser question, and it will call events during periods
 * when few spores are airborne. Treat a call here as "go and look",
 * not as an instruction. See docs: the model provider interface in
 * lib/disease-provider.ts exists so a better source can replace it.
 *
 * Provenance for every number in this file: lib/provenance.ts, or
 * `npx tsx scripts/audit-provenance.ts`. The Mills values are quoted;
 * the wetness thresholds are ours.
 *
 * Wetness is INFERRED here, not measured, from rain and humidity. That
 * is the model's weakest joint. A measured leaf-wetness sensor — the
 * kind AgWeatherNet stations carry, reporting LW_UNITY with 0.4 defined
 * as wet — would replace the inference outright and is the single
 * biggest improvement available.
 */

/**
 * Hours of wetness needed at a mean temperature.
 *
 * light / moderate / severe are the Low / Moderate / High infection
 * columns of the Jones revision of Mills' original table.
 *
 * `minimum` is separate and MORE CONSERVATIVE: the threshold NEWA
 * actually operates on, from MacHardy and Gadoury's 1989 revision,
 * which found ascospores need about three hours less than Mills
 * allowed. At 61-75°F that is 6 hours against the 9 at which a light
 * infection is counted, and at 39°F it is 28 against roughly 34.
 *
 * The distinction matters operationally: a model that only reports
 * light-and-above stays quiet through events a running system would
 * call. It is exposed as its own severity rather than folded into
 * 'light', because they answer different questions — "could infection
 * have occurred at all" and "was it enough to produce noticeable
 * lesions".
 */
interface MillsRow {
  /** Mean temperature over the wet period, °F. */
  tempF: number;
  /** NEWA / MacHardy-Gadoury minimum for any infection. */
  minimum: number;
  light: number;
  moderate: number;
  severe: number;
}

const MILLS: MillsRow[] = [
  { tempF: 78, minimum: 10, light: 13, moderate: 17, severe: 26 },
  { tempF: 77, minimum: 8, light: 11, moderate: 14, severe: 21 },
  { tempF: 76, minimum: 6, light: 9.5, moderate: 12, severe: 19 },
  { tempF: 66, minimum: 6, light: 9, moderate: 12, severe: 18 },
  { tempF: 61, minimum: 6, light: 9, moderate: 13, severe: 20 },
  { tempF: 60, minimum: 6.5, light: 9.5, moderate: 13, severe: 20 },
  { tempF: 59, minimum: 7, light: 10, moderate: 13, severe: 21 },
  { tempF: 58, minimum: 7, light: 10, moderate: 14, severe: 21 },
  { tempF: 56, minimum: 8, light: 11, moderate: 15, severe: 22 },
  { tempF: 55, minimum: 8, light: 11, moderate: 16, severe: 24 },
  { tempF: 54, minimum: 8.5, light: 11.5, moderate: 16, severe: 24 },
  { tempF: 53, minimum: 9, light: 12, moderate: 17, severe: 26 },
  { tempF: 52, minimum: 9, light: 12, moderate: 18, severe: 26 },
  { tempF: 51, minimum: 10, light: 13, moderate: 18, severe: 27 },
  { tempF: 50, minimum: 11, light: 14, moderate: 19, severe: 29 },
  { tempF: 49, minimum: 11.5, light: 14.5, moderate: 20, severe: 30 },
  { tempF: 48, minimum: 12, light: 15, moderate: 20, severe: 30 },
  { tempF: 47, minimum: 14, light: 17, moderate: 23, severe: 35 },
  { tempF: 46, minimum: 16, light: 19, moderate: 26, severe: 39 },
  { tempF: 45, minimum: 17, light: 20, moderate: 27, severe: 41 },
  { tempF: 44, minimum: 19, light: 22, moderate: 30, severe: 45 },
  { tempF: 43, minimum: 22, light: 25, moderate: 34, severe: 51 },
  { tempF: 42, minimum: 27, light: 30, moderate: 40, severe: 60 },
  { tempF: 33, minimum: 38, light: 41, moderate: 55, severe: 80 },
];

/** Below this, infection is not considered possible. */
const MIN_TEMP_F = 33;

/** Wetness requirement at a mean temperature, interpolated. */
export function millsRequirement(tempF: number): MillsRow | null {
  if (tempF < MIN_TEMP_F) return null;
  const rows = [...MILLS].sort((a, b) => a.tempF - b.tempF);
  if (tempF >= rows[rows.length - 1].tempF) return { ...rows[rows.length - 1], tempF };
  for (let i = 0; i < rows.length - 1; i++) {
    const lo = rows[i];
    const hi = rows[i + 1];
    if (tempF < lo.tempF || tempF > hi.tempF) continue;
    const span = hi.tempF - lo.tempF;
    const f = span === 0 ? 0 : (tempF - lo.tempF) / span;
    const mix = (a: number, b: number) => a + (b - a) * f;
    return {
      tempF,
      minimum: mix(lo.minimum, hi.minimum),
      light: mix(lo.light, hi.light),
      moderate: mix(lo.moderate, hi.moderate),
      severe: mix(lo.severe, hi.severe),
    };
  }
  return null;
}

export interface WetnessOptions {
  /** Rain in an hour above this counts as wet, mm. */
  precipMm?: number;
  /** Relative humidity above this counts as wet, %. */
  rhPct?: number;
  /**
   * Open-Meteo leaf-wetness probability above this counts as wet, %.
   * Null disables it — see the note on the default below.
   */
  leafWetnessPct?: number | null;
  /** Dry hours tolerated inside one wet period before it is broken. */
  breakHours?: number;
}

/**
 * Rain and humidity lead; the modelled leaf-wetness probability is OFF.
 *
 * It was checked against five years of this orchard's stored hours
 * before being trusted, and it does not behave like rain-driven leaf
 * wetness:
 *
 *   monthly means peak in July-September (51-53%) and bottom out in
 *   January-February (10-13%), which is backwards for a maritime site
 *   where winter is the wet season;
 *
 *   the August profile peaks overnight at 62-64% in a month averaging
 *   6 mm of rain — that is DEW, correctly modelled;
 *
 *   and on 1 December 2025, with 2.3 mm of rain falling, it read 6%.
 *
 * So it models dew well and rain poorly, and enabling it would call
 * wetness through every clear summer night while missing spring rain.
 * The plumbing stays because a site with real dew pressure may want it,
 * and because a measured leaf-wetness sensor — AgWeatherNet's LW_UNITY,
 * where 0.4 is defined as wet — would arrive through the same field and
 * IS trustworthy.
 */
const WETNESS_DEFAULTS: Required<Omit<WetnessOptions, 'leafWetnessPct'>> & {
  leafWetnessPct: number | null;
} = {
  precipMm: 0.2,
  rhPct: 90,
  leafWetnessPct: null,
  breakHours: 4,
};

/**
 * Was this hour wet?
 *
 * Rain is the sure signal. High humidity carries the drying tail after
 * the rain stops, which is often what completes an infection — leaves
 * in shade stay wet long after a gauge reads dry.
 */
export function isWetHour(h: HourWeather, options: WetnessOptions = {}): boolean {
  const o = { ...WETNESS_DEFAULTS, ...options };
  if (h.precipMm != null && h.precipMm >= o.precipMm) return true;
  if (o.leafWetnessPct != null && h.leafWetnessPct != null &&
      h.leafWetnessPct >= o.leafWetnessPct) {
    return true;
  }
  if (h.rhPct != null && h.rhPct >= o.rhPct) return true;
  return false;
}

export type InfectionSeverity = 'none' | 'minimal' | 'light' | 'moderate' | 'severe';

export interface WetPeriod {
  /** Local timestamps, "YYYY-MM-DDTHH:mm". */
  startTs: string;
  endTs: string;
  /** Hours counted wet, breaks included where they were bridged. */
  wetHours: number;
  meanTempF: number;
  severity: InfectionSeverity;
  /** Hours still needed for the next severity up, if any. */
  hoursToNext: number | null;
}

function severityFor(wetHours: number, meanTempF: number): {
  severity: InfectionSeverity;
  hoursToNext: number | null;
} {
  const req = millsRequirement(meanTempF);
  if (!req) return { severity: 'none', hoursToNext: null };
  if (wetHours >= req.severe) return { severity: 'severe', hoursToNext: null };
  if (wetHours >= req.moderate) return { severity: 'moderate', hoursToNext: req.severe - wetHours };
  if (wetHours >= req.light) return { severity: 'light', hoursToNext: req.moderate - wetHours };
  // The NEWA operating threshold: infection was possible, even if it
  // would not show as a noticeable crop of lesions.
  if (wetHours >= req.minimum) return { severity: 'minimal', hoursToNext: req.light - wetHours };
  return { severity: 'none', hoursToNext: req.minimum - wetHours };
}

/**
 * Find the wet periods in a run of hours, and score each one.
 *
 * A short dry spell does not end a wet period — dew and shade keep
 * leaves wet through a gap that a rain gauge reads as dry — so up to
 * `breakHours` dry hours are bridged rather than treated as the end.
 * Hours must be ordered ascending.
 */
export function findWetPeriods(
  hours: readonly HourWeather[],
  options: WetnessOptions = {}
): WetPeriod[] {
  const o = { ...WETNESS_DEFAULTS, ...options };
  const periods: WetPeriod[] = [];
  let run: HourWeather[] = [];
  let dryRun = 0;

  const close = () => {
    if (run.length === 0) return;
    // Trim any bridged dry tail — it is not part of the wet period.
    while (run.length > 0 && !isWetHour(run[run.length - 1], o)) run.pop();
    if (run.length === 0) return;
    const temps = run.map((h) => cToF(h.tempC));
    const meanTempF = temps.reduce((a, b) => a + b, 0) / temps.length;
    const { severity, hoursToNext } = severityFor(run.length, meanTempF);
    periods.push({
      startTs: run[0].ts,
      endTs: run[run.length - 1].ts,
      wetHours: run.length,
      meanTempF,
      severity,
      hoursToNext,
    });
    run = [];
  };

  for (const h of hours) {
    if (isWetHour(h, o)) {
      run.push(h);
      dryRun = 0;
      continue;
    }
    if (run.length === 0) continue;
    dryRun += 1;
    if (dryRun > o.breakHours) {
      close();
      dryRun = 0;
    } else {
      run.push(h); // bridged; trimmed on close if it ends up trailing
    }
  }
  close();
  return periods;
}

/** Periods that reached at least `minSeverity`. */
export function infectionPeriods(
  hours: readonly HourWeather[],
  minSeverity: Exclude<InfectionSeverity, 'none'> = 'light',
  options: WetnessOptions = {}
): WetPeriod[] {
  const rank: Record<InfectionSeverity, number> = {
    none: 0, minimal: 1, light: 2, moderate: 3, severe: 4,
  };
  return findWetPeriods(hours, options).filter(
    (p) => rank[p.severity] >= rank[minSeverity]
  );
}
