import type { HourTemp } from './chill';

/**
 * Growing degree days from hourly temperatures.
 *
 * Every insect has its OWN thresholds, and using one model for all of
 * them is how a programme mistimes everything except the pest it was
 * written for. Codling moth accumulates base 50°F with an 88°F cutoff;
 * Pandemis and obliquebanded leafroller run base 41°F with an 85°F
 * cutoff — over a spring that is a difference of weeks, not days.
 *
 * Accumulation also starts in one of two places. Codling moth here uses
 * the NO-BIOFIX variant, valid north of 46°N, counting from January 1.
 * The leafroller models count from a BIOFIX: the date a pheromone trap
 * first catches, which only the orchard's own traps can supply.
 */

/** The codling moth model, and the default where none is given. */
export const CODLING_MOTH_MODEL = { base: 50, cutoff: 88 } as const;

/** Pandemis and obliquebanded leafroller (WSU). */
export const LEAFROLLER_MODEL = { base: 41, cutoff: 85 } as const;

export interface DegreeDayModel {
  /** Lower developmental threshold, °F. */
  base: number;
  /** Upper horizontal cutoff, °F. */
  cutoff: number;
}

export function cToF(c: number): number {
  return c * (9 / 5) + 32;
}

/** Degree-day contribution of a single hour under a given model. */
function hourDD(tempC: number, model: DegreeDayModel): number {
  const f = Math.min(cToF(tempC), model.cutoff);
  return Math.max(0, f - model.base) / 24;
}

/** Total degree days over the given hours. Defaults to codling moth. */
export function gddTotal(
  hours: readonly HourTemp[],
  model: DegreeDayModel = CODLING_MOTH_MODEL
): number {
  let dd = 0;
  for (const h of hours) dd += hourDD(h.tempC, model);
  return dd;
}

/** Base 50°F, cutoff 88°F — kept because chill/season summaries use it. */
export function gdd50(hours: readonly HourTemp[]): number {
  return gddTotal(hours, CODLING_MOTH_MODEL);
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
  thresholds: readonly number[],
  model: DegreeDayModel = CODLING_MOTH_MODEL,
  /** Accumulate only from this local date onward — a biofix. */
  startYmd?: string | null
): Map<number, string | null> {
  const wanted = [...new Set(thresholds)].sort((a, b) => a - b);
  const out = new Map<number, string | null>(wanted.map((t) => [t, null]));
  let dd = 0;
  let i = 0;
  for (const h of hours) {
    if (startYmd && h.ts.slice(0, 10) < startYmd) continue;
    dd += hourDD(h.tempC, model);
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
