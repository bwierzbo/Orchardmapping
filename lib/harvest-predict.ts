/**
 * Turning a variety's interval into a window on a calendar.
 *
 * Two inputs, either of which may be missing or weak, and the answer has to
 * say which. The interval comes from the variety library or from this
 * orchard's own records; the bloom date comes from a phenology mark, or --
 * while none have been recorded -- from the regional average. A prediction
 * resting on two assumptions must look less certain than one resting on a
 * measured bloom and a measured interval, or nobody should trust either.
 */
import {
  REGIONAL_BLOOM_DOY,
  harvestWindowFor,
  type HarvestPurpose,
  type HarvestWindow,
  type TargetBasis,
} from './harvest-target';

/** Where the bloom date came from. */
export type BloomSource = 'recorded' | 'regional';

/**
 * Half-width of the uncertainty, in days, for each interval basis when the
 * bloom date was actually observed.
 *
 * An interval measured at a research station still moves a few days between
 * seasons and sites; one read off the word "Late" is barely a fortnight's
 * guess. These are deliberately generous -- a window that claims more
 * precision than it has is worse than one that admits the spread.
 */
const CONFIDENCE_BY_BASIS: Record<TargetBasis, number> = {
  observed: 4,
  wsu_paired: 7,
  text_date: 10,
  season_word: 14,
};

/**
 * Added when the bloom date was not observed but assumed from the region.
 * Bloom itself moves a fortnight between springs, so half of that is the
 * least this can honestly be.
 */
export const ASSUMED_BLOOM_PENALTY_DAYS = 7;

/**
 * Past this date, a maritime western Washington season is running out of
 * heat. The variety library says as much in its own words -- "In western
 * Washington full maturity is not reliable every year" -- and a prediction
 * landing here should say so rather than name a day in November as though
 * the fruit will certainly be ready for it.
 */
export const LATE_SEASON_CUTOFF = { month: 11, day: 1 };

export interface PredictInput {
  /** Days from full bloom to picking, for the chosen purpose. */
  daysFromBloom: number;
  basis: TargetBasis;
  purpose: HarvestPurpose;
  /** The season being predicted. */
  year: number;
  /** Observed full bloom for this variety, if a mark has been recorded. */
  bloom?: Date | null;
}

export interface Prediction {
  window: HarvestWindow;
  bloom: Date;
  bloomSource: BloomSource;
  basis: TargetBasis;
  /** Half-width of the uncertainty around the centre, in days. */
  confidenceDays: number;
  /** True when the window runs past the point the season reliably ripens fruit. */
  lateSeasonRisk: boolean;
  /** One line for the UI, saying what the prediction rests on. */
  note: string;
}

/** Day `n` of a year, as a UTC date. Day 1 is 1 January. */
export function dateFromDayOfYear(year: number, dayOfYear: number): Date {
  return new Date(Date.UTC(year, 0, dayOfYear));
}

const BASIS_PHRASE: Record<TargetBasis, string> = {
  observed: 'this orchard’s own harvest records',
  wsu_paired: 'bloom and harvest measured at WSU Mount Vernon',
  text_date: 'a harvest date in the variety library',
  season_word: 'only a season word in the variety library',
};

export function predictHarvest(input: PredictInput): Prediction {
  const bloomSource: BloomSource = input.bloom ? 'recorded' : 'regional';
  const bloom = input.bloom ?? dateFromDayOfYear(input.year, REGIONAL_BLOOM_DOY);

  const window = harvestWindowFor(bloom, input.daysFromBloom, input.purpose);

  const confidenceDays =
    CONFIDENCE_BY_BASIS[input.basis] +
    (bloomSource === 'regional' ? ASSUMED_BLOOM_PENALTY_DAYS : 0);

  // The risk is about the window closing too late to ripen, so it is the
  // END of the window that matters, not the centre.
  const cutoff = new Date(
    Date.UTC(input.year, LATE_SEASON_CUTOFF.month - 1, LATE_SEASON_CUTOFF.day)
  );
  const lateSeasonRisk = window.end.getTime() > cutoff.getTime();

  const bloomPhrase =
    bloomSource === 'recorded'
      ? 'bloom recorded here'
      : 'bloom assumed from the regional average (8 May) — none recorded';

  const note = `From ${BASIS_PHRASE[input.basis]}, ${bloomPhrase}. ±${confidenceDays} days.`;

  return { window, bloom, bloomSource, basis: input.basis, confidenceDays, lateSeasonRisk, note };
}

/**
 * How certain a prediction is, for colouring. Bands rather than a number,
 * because the point is to be read at a glance off a chart.
 */
export type Certainty = 'measured' | 'derived' | 'guessed';

export function certaintyOf(prediction: Prediction): Certainty {
  if (prediction.confidenceDays <= 7) return 'measured';
  if (prediction.confidenceDays <= 14) return 'derived';
  return 'guessed';
}
