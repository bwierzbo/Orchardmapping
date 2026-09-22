/**
 * Chill accumulation models over hourly temperatures.
 *
 * Primary model: Dynamic (Fishman/Erez "chill portions") — the most
 * robust model in mild maritime winters, where the classic chill-hours
 * count over-credits long 35–45°F spells and the Utah model's negation
 * over-punishes them. Chill hours (32–45°F) are computed alongside
 * because nursery catalogs quote variety requirements in hours.
 */

export interface HourTemp {
  /** Orchard-local timestamp, e.g. "2025-11-01T13:00" (no zone). */
  ts: string;
  tempC: number;
}

// Fishman/Erez two-step model constants (as used in chillR and the
// UC Davis chill calculator).
const SLP = 1.6;
const TETMLT = 277;
const A0 = 139500;
const A1 = 2.567e18;
const E0 = 4153.5;
const E1 = 12888.8;

/**
 * Dynamic-model chill portions for a sequence of consecutive hourly
 * temperatures. Order matters: pass hours sorted ascending by time.
 */
export function chillPortions(hours: readonly HourTemp[]): number {
  let interE = 0;
  let portions = 0;
  for (const h of hours) {
    const tk = h.tempC + 273.15;
    const ftmprt = (SLP * TETMLT * (tk - TETMLT)) / tk;
    const sr = Math.exp(ftmprt);
    const xi = sr / (1 + sr);
    const xs = (A0 / A1) * Math.exp(-(E0 - E1) / tk);
    const ak1 = A1 * Math.exp(-E1 / tk);
    const interS = interE < 1 ? interE : interE * (1 - xi);
    interE = xs - (xs - interS) * Math.exp(-ak1);
    if (interE >= 1) portions += xi * interE;
  }
  return portions;
}

const CHILL_MIN_C = 0; // 32°F
const CHILL_MAX_C = 7.222; // 45°F

/** Classic chill hours: count of hours with temperature in 32–45°F. */
export function chillHours(hours: readonly HourTemp[]): number {
  let n = 0;
  for (const h of hours) {
    if (h.tempC >= CHILL_MIN_C && h.tempC <= CHILL_MAX_C) n++;
  }
  return n;
}

/**
 * When a region accumulates chill. Nov 1 to Apr 30 in the maritime
 * Pacific Northwest, but this is climate- and hemisphere-specific: a
 * continental orchard is banking chill well before November, and south
 * of the equator the season runs through the middle of the year.
 */
export interface ChillWindow {
  startMmdd: string;
  endMmdd: string;
}

/** What this app assumed everywhere before regions existed. */
export const MARITIME_PNW_CHILL: ChillWindow = { startMmdd: '11-01', endMmdd: '04-30' };

/**
 * Chill season window for a given "as of" local date, in the region's
 * own window. Returns [startYmd, endYmd] where end is capped at `asOf`.
 */
export function chillSeasonWindow(
  asOfYmd: string,
  window: ChillWindow = MARITIME_PNW_CHILL
): { start: string; end: string; label: string } {
  const [y] = asOfYmd.split('-').map(Number);
  const mmdd = asOfYmd.slice(5);
  // A season that opens in the autumn belongs to the year it opened in;
  // one that opens and closes inside a calendar year does not straddle.
  const straddlesYearEnd = window.startMmdd > window.endMmdd;
  const startYear = straddlesYearEnd ? (mmdd >= window.startMmdd ? y : y - 1) : y;
  const endYear = straddlesYearEnd ? startYear + 1 : startYear;
  const start = `${startYear}-${window.startMmdd}`;
  const hardEnd = `${endYear}-${window.endMmdd}`;
  const end = asOfYmd < hardEnd ? asOfYmd : hardEnd;
  const label = straddlesYearEnd
    ? `${startYear}–${String(endYear % 100).padStart(2, '0')}`
    : String(startYear);
  return { start, end, label };
}
