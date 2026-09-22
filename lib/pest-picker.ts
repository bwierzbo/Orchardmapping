/**
 * Which pests to put in front of somebody standing at a tree.
 *
 * The full library is nineteen entries and growing, which is a scroll on
 * a phone in an orchard. The picker shows a handful and hides the rest
 * behind "More" — so the question is what earns a visible slot.
 */

/** How many get a slot before the "More" button. */
export const TOP_PESTS = 5;

export interface PickablePest {
  key: string;
  name: string;
  category: string;
  /** The region's answer. Null when this region has not been assessed. */
  prevalence: string | null;
}

/**
 * Prevalence, as a sort key.
 *
 * 'absent' goes last but stays in the list: a region saying fire blight
 * is not a problem here is a claim, and the person looking at the tree
 * is the one who can disprove it. Hiding it would make that impossible.
 * Unassessed sits above 'beneficial' and 'absent' because unknown is not
 * the same as "unlikely" — it is a region nobody has ranked yet.
 */
const PREVALENCE_RANK: Record<string, number> = {
  high: 0,
  moderate: 1,
  low: 2,
  beneficial: 4,
  absent: 5,
};
const UNASSESSED_RANK = 3;

export function prevalenceRank(prevalence: string | null): number {
  if (!prevalence) return UNASSESSED_RANK;
  return PREVALENCE_RANK[prevalence] ?? UNASSESSED_RANK;
}

/**
 * Order the library for the picker.
 *
 * What this orchard has actually been finding comes first — the local
 * picture outranks the generic one, which is what pest_observations was
 * always for. Regional prevalence breaks the tie, then the library's own
 * ordering, then the name so the list never reshuffles for no reason.
 *
 * With no region set, every prevalence is null, so the ranking collapses
 * to sightings and then the library order. That is deliberately NOT a
 * silent fallback to another region's ranking: "fire blight, absent" is
 * true west of the Cascades and dangerous in Michigan. The caller is
 * expected to say the list is unranked.
 */
export function rankPests<T extends PickablePest>(
  entries: readonly T[],
  sightingsHere: Readonly<Record<string, number>>
): T[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const seen = (sightingsHere[b.entry.key] ?? 0) - (sightingsHere[a.entry.key] ?? 0);
      if (seen !== 0) return seen;
      const prevalence = prevalenceRank(a.entry.prevalence) - prevalenceRank(b.entry.prevalence);
      if (prevalence !== 0) return prevalence;
      // The incoming order is the library's sort_order; keep it.
      return a.index - b.index;
    })
    .map(({ entry }) => entry);
}

/** The ranked list split at the "More" boundary. */
export function splitForPicker<T extends PickablePest>(
  entries: readonly T[],
  sightingsHere: Readonly<Record<string, number>>,
  alwaysShow: readonly string[] = []
): { top: T[]; rest: T[] } {
  const ranked = rankPests(entries, sightingsHere);
  // A pest already ticked on this tree must stay visible even if it
  // ranks below the cut, or tapping "More" would be the only way to see
  // what you had just selected.
  const pinned = new Set(alwaysShow);
  const top = ranked.slice(0, TOP_PESTS);
  const rest: T[] = [];
  for (const entry of ranked.slice(TOP_PESTS)) {
    if (pinned.has(entry.key)) top.push(entry);
    else rest.push(entry);
  }
  return { top, rest };
}
