import type { HourTemp } from './chill';

/**
 * Growing degree days from hourly temperatures.
 *
 * Base 50°F with an 88°F horizontal cutoff — the parameters of WSU's
 * codling moth model. Port Angeles (~48.1°N) is north of 46°N, so the
 * no-biofix variant applies: accumulate from January 1 and read
 * milestones directly off the running total.
 */

const BASE_F = 50;
const CAP_F = 88;

export function cToF(c: number): number {
  return c * (9 / 5) + 32;
}

/** Degree-day contribution of a single hour. */
function hourDD(tempC: number): number {
  const f = Math.min(cToF(tempC), CAP_F);
  return Math.max(0, f - BASE_F) / 24;
}

/** Total GDD (base 50°F, cap 88°F) over the given hours. */
export function gdd50(hours: readonly HourTemp[]): number {
  let dd = 0;
  for (const h of hours) dd += hourDD(h.tempC);
  return dd;
}

/** WSU no-biofix codling moth milestones (°F DD from Jan 1). */
export const CM_MILESTONES = [
  { dd: 375, label: 'CM oil window', detail: 'topical ovicide (oil)' },
  { dd: 425, label: 'CM gen-1 hatch', detail: 'first treatment target' },
  { dd: 1400, label: 'CM gen-2 hatch', detail: 'second-generation target' },
] as const;

export interface MilestoneHit {
  dd: number;
  label: string;
  detail: string;
  /** Local YYYY-MM-DD the running total crossed the threshold, if reached. */
  date: string | null;
}

/**
 * Walk hours in time order, returning the local date the running total
 * crossed each threshold (null when not yet reached). One pass covers
 * every threshold asked for, so a schedule with a dozen degree-day
 * steps costs the same as one.
 */
export function ddCrossingDates(
  hours: readonly HourTemp[],
  thresholds: readonly number[]
): Map<number, string | null> {
  const wanted = [...new Set(thresholds)].sort((a, b) => a - b);
  const out = new Map<number, string | null>(wanted.map((t) => [t, null]));
  let dd = 0;
  let i = 0;
  for (const h of hours) {
    dd += hourDD(h.tempC);
    while (i < wanted.length && dd >= wanted[i]) {
      out.set(wanted[i], h.ts.slice(0, 10));
      i++;
    }
    if (i >= wanted.length) break;
  }
  return out;
}

/** The codling moth milestones, dated against a season's hours. */
export function milestoneDates(hours: readonly HourTemp[]): MilestoneHit[] {
  const crossed = ddCrossingDates(
    hours,
    CM_MILESTONES.map((m) => m.dd)
  );
  return CM_MILESTONES.map((m) => ({ ...m, date: crossed.get(m.dd) ?? null }));
}
