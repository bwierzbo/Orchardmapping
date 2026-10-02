/**
 * "When would you pick this?", asked at the tree.
 *
 * Every number in the harvest predictor is seeded -- from a WSU pair, a
 * library date, or a season word. None is observed, and none can be until a
 * bloom and a harvest are recorded in the same season. A verdict from the
 * person standing at the tree arrives weeks earlier than that and costs one
 * tap, so it is the first real check the prediction gets.
 *
 * Recorded beside the window that was predicted AT THE TIME, not the one
 * predicted later: the point is whether the model was right that day.
 */

const SHORT_MONTH = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const READINESS_VERDICTS = ['now', 'week', 'two_weeks', 'not_yet'] as const;
export type ReadinessVerdict = (typeof READINESS_VERDICTS)[number];

export const READINESS_LABEL: Record<ReadinessVerdict, string> = {
  now: 'Pick now',
  week: 'About a week',
  two_weeks: 'Two weeks',
  not_yet: 'Not yet',
};

/** Days out each verdict stands for, for comparing against a prediction. */
export const READINESS_DAYS: Record<ReadinessVerdict, number> = {
  now: 0,
  week: 7,
  two_weeks: 14,
  // Open-ended: "not yet" means further out than a fortnight, and nothing
  // more precise should be read into it.
  not_yet: 28,
};

export interface ReadinessRecord {
  verdict: ReadinessVerdict;
  /** What the model said when the verdict was given, ISO date, if anything. */
  predictedCentre: string | null;
  /** Observation date, ISO. */
  observedOn: string;
}

/**
 * How far the verdict sat from the prediction, in days. Positive means the
 * tree was readier than predicted -- the model was running late.
 *
 * Null when there was no prediction to compare with, which is honest: an
 * unanchored verdict is still worth recording, it just says nothing about
 * the model.
 */
export function readinessDelta(record: ReadinessRecord): number | null {
  if (!record.predictedCentre) return null;
  const predicted = Date.parse(`${record.predictedCentre}T00:00:00Z`);
  const observed = Date.parse(`${record.observedOn}T00:00:00Z`);
  if (Number.isNaN(predicted) || Number.isNaN(observed)) return null;
  const impliedPick = observed + READINESS_DAYS[record.verdict] * 86_400_000;
  return Math.round((predicted - impliedPick) / 86_400_000);
}

/** One line for the UI: what the model expects, in words. */
export function describePrediction(
  predictedCentre: string | null,
  todayIso: string
): string {
  if (!predictedCentre) return 'No picking date predicted for this variety yet.';
  const predicted = Date.parse(`${predictedCentre}T00:00:00Z`);
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  if (Number.isNaN(predicted) || Number.isNaN(today)) {
    return 'No picking date predicted for this variety yet.';
  }
  const days = Math.round((predicted - today) / 86_400_000);
  // Formatted by hand rather than through toLocaleDateString: en-GB spells
  // September "Sept" in some ICU builds and "Sep" in others, so the same
  // code renders differently on two machines.
  const d = new Date(predicted);
  const when = `${d.getUTCDate()} ${SHORT_MONTH[d.getUTCMonth()]}`;
  if (days === 0) return `Model expects picking today (${when}).`;
  if (days > 0) return `Model expects picking in ${days} day${days === 1 ? '' : 's'} (${when}).`;
  const late = Math.abs(days);
  return `Model expected picking ${late} day${late === 1 ? '' : 's'} ago (${when}).`;
}
