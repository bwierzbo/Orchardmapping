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
 * Chill season window for a given "as of" local date: Nov 1 through
 * Apr 30. Returns [startYmd, endYmd] where end is capped at `asOf`.
 */
export function chillSeasonWindow(asOfYmd: string): { start: string; end: string; label: string } {
  const [y, m] = asOfYmd.split('-').map(Number);
  const startYear = m >= 11 ? y : y - 1;
  const start = `${startYear}-11-01`;
  const hardEnd = `${startYear + 1}-04-30`;
  const end = asOfYmd < hardEnd ? asOfYmd : hardEnd;
  return { start, end, label: `${startYear}–${String((startYear + 1) % 100).padStart(2, '0')}` };
}
