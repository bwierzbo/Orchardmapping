/**
 * Showing a previous reading without recording it again.
 *
 * A measurement is never carried forward into the field. A starch index of
 * 4 from nine days ago, written into today's record because nobody cleared
 * the box, is a false reading dated today -- and the starch TRAJECTORY is
 * what the harvest predictor reads, so a stale one dated fresh is worse
 * than a blank. The previous number goes in the placeholder instead: grey,
 * in the right place, gone the moment you type, and never submitted.
 */
import { brixToSg } from './sugar';
import { mmToInches } from './fruit-metrics';

export interface PreviousReading {
  /** What to show greyed in the empty field. */
  ghost: string;
  /** "was 4.0" style text for beside it. */
  was: string;
}

/**
 * Format a stored metric for display in the unit currently on screen.
 * Stored values are canonical -- Brix and millimetres -- so a form showing
 * SG or inches has to convert before it can show the old number.
 */
export function previousReading(
  key: string,
  stored: number | undefined,
  units: { sugar: 'brix' | 'sg'; size: 'mm' | 'in' }
): PreviousReading | null {
  if (stored === undefined || !Number.isFinite(stored)) return null;

  if (key === 'brix' && units.sugar === 'sg') {
    const sg = brixToSg(stored);
    return { ghost: sg.toFixed(3), was: `was ${sg.toFixed(3)}` };
  }
  if (key === 'size_mm' && units.size === 'in') {
    const inches = mmToInches(stored);
    return { ghost: inches.toFixed(1), was: `was ${inches.toFixed(1)} in` };
  }
  // Counts and indices read better without a forced decimal; a measured
  // value keeps one.
  const whole = Number.isInteger(stored);
  const text = whole ? String(stored) : stored.toFixed(1);
  return { ghost: text, was: `was ${text}` };
}

/**
 * The change since last time, once something has been typed. Null when
 * there is nothing to compare, or when the two are equal -- "+0" is noise.
 */
export function readingDelta(
  typed: string,
  stored: number | undefined
): { text: string; direction: 'up' | 'down' } | null {
  if (stored === undefined || !Number.isFinite(stored)) return null;
  const now = Number(typed);
  if (typed.trim() === '' || !Number.isFinite(now)) return null;
  const diff = now - stored;
  if (Math.abs(diff) < 0.05) return null;
  const whole = Number.isInteger(diff);
  const magnitude = whole ? String(Math.abs(diff)) : Math.abs(diff).toFixed(1);
  return {
    text: `${diff > 0 ? '+' : '−'}${magnitude}`,
    direction: diff > 0 ? 'up' : 'down',
  };
}
