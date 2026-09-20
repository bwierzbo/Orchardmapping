/**
 * Laying a season out across one horizontal axis.
 *
 * An IPM year has a shape: disease-led autumn, copper and sulfur in
 * spring, monitor-only summer. A month grid fragments exactly the thing
 * worth seeing, so the program is drawn as one year-long axis with a
 * lane per category.
 *
 * Pure geometry — percentages, not pixels — so it is testable and the
 * component stays a matter of styling.
 */

/** Days in a calendar year, leap years included. */
export function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

/** 1 for Jan 1. Parsed as UTC so no zone can shift the day. */
export function dayOfYear(ymd: string): number {
  const year = Number(ymd.slice(0, 4));
  const ms = Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${year}-01-01T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Where a date sits on the axis, 0 at Jan 1 and 100 at Dec 31.
 * Dates outside the season are clamped, which is what makes a window
 * wrapping into next year land on the right-hand edge.
 */
export function pctOfYear(ymd: string, season: number): number {
  const year = Number(ymd.slice(0, 4));
  if (year < season) return 0;
  if (year > season) return 100;
  return ((dayOfYear(ymd) - 1) / daysInYear(season)) * 100;
}

export interface TimelineBar {
  startPct: number;
  widthPct: number;
  /** The window began before this season — drawn flush to the left. */
  clippedStart: boolean;
  /** It runs past Dec 31, or has no end at all — flush to the right. */
  clippedEnd: boolean;
}

/** A one-day window still has to be visible. */
const MIN_WIDTH_PCT = 0.8;

/**
 * A bar for a window. A null end means open-ended — a step running
 * until a stage that has not been marked yet — and reaches the right
 * edge, which is honest: we do not know when it closes.
 */
export function barFor(
  start: string | null,
  end: string | null,
  season: number
): TimelineBar | null {
  if (!start) return null;
  if (Number(start.slice(0, 4)) > season) return null;

  const startPct = pctOfYear(start, season);
  const endPct = end === null ? 100 : pctOfYear(end, season);
  if (endPct < startPct) return null; // ended before it began

  return {
    startPct,
    widthPct: Math.max(MIN_WIDTH_PCT, endPct - startPct),
    clippedStart: Number(start.slice(0, 4)) < season,
    clippedEnd: end === null || Number(end.slice(0, 4)) > season,
  };
}

export interface MonthTick {
  /** Single letter, as month axes are conventionally labelled. */
  label: string;
  /** Full name, for the title attribute. */
  name: string;
  pct: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Gridline positions for the twelve months. */
export function monthTicks(season: number): MonthTick[] {
  return MONTH_NAMES.map((name, i) => ({
    label: name[0],
    name,
    pct: pctOfYear(`${season}-${String(i + 1).padStart(2, '0')}-01`, season),
  }));
}
