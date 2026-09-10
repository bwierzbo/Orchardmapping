import { chillPortions, chillHours, chillSeasonWindow, type HourTemp } from './chill';
import { gdd50, milestoneDates, type MilestoneHit } from './gdd';

/**
 * Assemble the dashboard season summary from stored hourly temps.
 * Pure — all data fetching happens in the caller.
 */

export interface SeasonSummary {
  chill: {
    seasonLabel: string;
    portions: number;
    hours: number;
    avgHours: number | null;
    /** True once the season window has closed (past Apr 30). */
    complete: boolean;
  };
  gdd: {
    year: number;
    value: number;
    avgValue: number | null;
  };
  milestones: MilestoneHit[];
  priorYears: number;
  dataThrough: string | null;
}

export function buildSeasonSummary(input: {
  asOfYmd: string;
  /** Hours inside the chill season window (Nov 1 → min(asOf, Apr 30)). */
  chillWindowHours: readonly HourTemp[];
  /** Hours from Jan 1 of the as-of year through asOf. */
  yearHours: readonly HourTemp[];
  avgChillHours: number | null;
  avgGdd: number | null;
  priorYears: number;
  dataThrough: string | null;
}): SeasonSummary {
  const window = chillSeasonWindow(input.asOfYmd);
  return {
    chill: {
      seasonLabel: window.label,
      portions: chillPortions(input.chillWindowHours),
      hours: chillHours(input.chillWindowHours),
      avgHours: input.avgChillHours,
      complete: window.end < input.asOfYmd,
    },
    gdd: {
      year: Number(input.asOfYmd.slice(0, 4)),
      value: gdd50(input.yearHours),
      avgValue: input.avgGdd,
    },
    milestones: milestoneDates(input.yearHours),
    priorYears: input.priorYears,
    dataThrough: input.dataThrough,
  };
}
