/**
 * Taking a tree out and planting another in its spot: the rules, kept apart
 * from the database module so the replace form can check its own input
 * without pulling a Postgres client into the browser.
 */

export interface TreeReplacementInput {
  /** Day the old tree came out, YYYY-MM-DD. */
  removedOn: string;
  /** Why it came out, in the grower's words. Optional. */
  reason?: string | null;
  /** Day the new tree went in, YYYY-MM-DD. */
  plantedOn: string;
  variety: string;
  fruitType?: string | null;
  rootstock?: string | null;
  source?: string | null;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day, not just the right shape: 2026-02-30 is refused. */
export function isCalendarDay(value: string): boolean {
  if (!YMD.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * What is wrong with a replacement, as sentences for the form; empty when
 * it can be recorded.
 *
 * `today` is the grower's calendar day, passed in rather than read from a
 * clock so a server in UTC cannot refuse an evening entry as "tomorrow".
 * YYYY-MM-DD strings compare correctly as text.
 */
export function replacementProblems(input: TreeReplacementInput, today: string): string[] {
  const problems: string[] = [];
  const removedOk = isCalendarDay(input.removedOn);
  const plantedOk = isCalendarDay(input.plantedOn);

  if (!removedOk) problems.push('Say which day the old tree came out.');
  else if (input.removedOn > today) problems.push('The old tree cannot come out on a day still to come.');

  if (!plantedOk) problems.push('Say which day the new tree went in.');
  else if (input.plantedOn > today) problems.push('The new tree cannot go in on a day still to come.');

  if (removedOk && plantedOk && input.plantedOn < input.removedOn) {
    problems.push('The new tree cannot go in before the old one came out.');
  }

  if (!input.variety.trim()) problems.push('Say what variety was planted.');

  return problems;
}

