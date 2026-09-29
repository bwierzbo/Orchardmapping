/**
 * Reading an approximate pick date out of a variety's harvest window.
 *
 * The window is free text and is written like a person talks: "early Oct",
 * "Late September to mid-October", "Mid-October at WSU Mount Vernon (10/12
 * mean); late October in England", or just "Late". Useful for reading,
 * useless for sorting -- and sorting is the point when the question is
 * which of several orchards wants picking first.
 *
 * So a date is estimated from the first month the text names, nudged by an
 * early/mid/late qualifier in front of it. Deliberately conservative:
 *
 *  - Only a named month produces an estimate. "Late" on its own says the
 *    tree is late *for its species*, which is not a date, and turning it
 *    into one would put a guess in a column people plan from.
 *  - The FIRST month wins. "Late September to mid-October" is a window
 *    that opens in late September; the opening is what a picking order
 *    needs.
 *  - Anything unparsed sorts last and displays blank. The prose stays
 *    visible beside it and remains the authority.
 */

const MONTHS: readonly string[] = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Day of the month each qualifier stands for. */
const QUALIFIER_DAY: Record<string, number> = {
  early: 5,
  mid: 15,
  late: 25,
};

const DEFAULT_DAY = 15;

/** Days before the first of each month in a non-leap year. */
const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export interface PickEstimate {
  /** 1-12. */
  month: number;
  /** 1-31, from the qualifier. */
  day: number;
  /** Position in the year, for sorting. */
  dayOfYear: number;
  /** Short form for the column, e.g. "≈ 5 Oct". */
  label: string;
}

const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Find the first month named in the text and the qualifier attached to it.
 * Returns null when the text names no month.
 */
export function estimatePickDate(window: string | null | undefined): PickEstimate | null {
  const text = window?.trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  let bestIndex = -1;
  let monthNumber = 0;
  for (let m = 0; m < MONTHS.length; m += 1) {
    const full = MONTHS[m];
    // Three letters is enough to match, but the match must end on a word
    // boundary or at the rest of the month's own name -- otherwise "may"
    // inside "mayn't" and "mar" inside "March" fight each other.
    const pattern = new RegExp(`\\b${full.slice(0, 3)}(${full.slice(3)}|\\.)?\\b`, 'i');
    const found = lower.search(pattern);
    if (found !== -1 && (bestIndex === -1 || found < bestIndex)) {
      bestIndex = found;
      monthNumber = m + 1;
    }
  }
  if (bestIndex === -1) return null;

  // The qualifier, if one sits just before the month: "late September",
  // "mid-October", "early Oct". Anything further away belongs to a
  // different clause.
  const before = lower.slice(Math.max(0, bestIndex - 12), bestIndex);
  let day = DEFAULT_DAY;
  for (const [word, value] of Object.entries(QUALIFIER_DAY)) {
    if (new RegExp(`${word}[\\s-]*$`).test(before)) {
      day = value;
      break;
    }
  }

  return {
    month: monthNumber,
    day,
    dayOfYear: DAYS_BEFORE_MONTH[monthNumber - 1] + day,
    label: `≈ ${day} ${SHORT_MONTH[monthNumber - 1]}`,
  };
}

/**
 * Sort key for a harvest window: earlier pick dates first, everything
 * without an estimate last, whichever way the column is sorted from.
 */
export function harvestSortKey(window: string | null | undefined): number {
  return estimatePickDate(window)?.dayOfYear ?? Number.MAX_SAFE_INTEGER;
}
