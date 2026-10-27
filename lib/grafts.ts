/**
 * More than one variety on a tree: the rules, kept apart from the database
 * module so the panel, the pick form and the server all read the same ones
 * without the browser pulling in a Postgres client.
 *
 * The tree's own variety is what it was planted as. A graft is another
 * variety on one of its scaffolds, placed by compass point and tier so it
 * can be found again standing at the tree.
 */

import { isHarvestComplete } from './tree-harvest-season';

/** Eight compass points, clockwise from north: the side a scaffold leaves the trunk. */
export const SCAFFOLD_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type ScaffoldDirection = (typeof SCAFFOLD_DIRECTIONS)[number];

/** Tiers of scaffolds, 1 the lowest. */
export const SCAFFOLD_TIERS = [1, 2, 3] as const;
export type ScaffoldTier = (typeof SCAFFOLD_TIERS)[number];

/** A graft that took and is still on the tree, one that did not, and one cut out. */
export const GRAFT_STATUSES = ['growing', 'failed', 'removed'] as const;
export type GraftStatus = (typeof GRAFT_STATUSES)[number];

export const GRAFT_STATUS_LABEL: Record<GraftStatus, string> = {
  growing: 'Growing',
  failed: 'Did not take',
  removed: 'Cut out',
};

const TIER_LABEL: Record<ScaffoldTier, string> = { 1: '1st', 2: '2nd', 3: '3rd' };

/** A graft as the client reads it: dates as YYYY-MM-DD. */
export interface ClientGraft {
  id: number;
  tree_id: string;
  variety: string;
  scaffold_direction: ScaffoldDirection | null;
  scaffold_tier: ScaffoldTier | null;
  tag: string | null;
  grafted_on: string | null;
  status: GraftStatus;
  status_on: string | null;
  photo_url: string | null;
  notes: string | null;
  harvest_completed_on: string | null;
}

/** What a graft form sends. Every field but the variety may be left out. */
export interface GraftInput {
  variety: string;
  scaffold_direction?: ScaffoldDirection | null;
  scaffold_tier?: ScaffoldTier | null;
  tag?: string | null;
  grafted_on?: string | null;
  status?: GraftStatus;
  status_on?: string | null;
  photo_url?: string | null;
  notes?: string | null;
}

/**
 * Where on the tree, as it is said in the field: "2nd tier, NE scaffold".
 * Null when neither part was recorded.
 */
export function describeGraftPlace(graft: {
  scaffold_direction: ScaffoldDirection | null;
  scaffold_tier: ScaffoldTier | null;
}): string | null {
  const { scaffold_direction: dir, scaffold_tier: tier } = graft;
  if (dir && tier) return `${TIER_LABEL[tier]} tier, ${dir} scaffold`;
  if (dir) return `${dir} scaffold`;
  if (tier) return `${TIER_LABEL[tier]} tier`;
  return null;
}

/** The grafts that bear: only a growing one has fruit to pick or a season to close. */
export function growingGrafts<T extends { status: GraftStatus }>(grafts: readonly T[]): T[] {
  return grafts.filter((g) => g.status === 'growing');
}

/**
 * The varieties a pick can be, the tree's own first.
 *
 * A graft of the tree's own variety adds nothing to choose between, and two
 * grafts of one variety are one choice: picks are recorded by variety, not
 * by limb. Names compare without case or edge spaces, as the variety
 * library does. A tree with no variety and no grafts has none, and its
 * picks carry no variety, as before.
 */
export function treeVarieties(
  mainVariety: string | null | undefined,
  grafts: readonly { variety: string; status: GraftStatus }[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (v: string | null | undefined) => {
    const name = v?.trim();
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    out.push(name);
  };
  add(mainVariety);
  for (const g of growingGrafts(grafts)) add(g.variety);
  return out;
}

/**
 * Every variety a listed tree carries, its own first: what the map's
 * filters, search and tooltip match against. `graft_varieties` comes with
 * the tree list (growing grafts only), so this needs no extra request.
 */
export function varietiesOf(tree: {
  variety?: string | null;
  graft_varieties?: readonly string[] | null;
}): string[] {
  return treeVarieties(
    tree.variety,
    (tree.graft_varieties ?? []).map((variety) => ({ variety, status: 'growing' as const }))
  );
}

/** Whether a tree has more than one variety to pick, and so picks by variety. */
export function picksByVariety(
  mainVariety: string | null | undefined,
  grafts: readonly { variety: string; status: GraftStatus }[]
): boolean {
  return treeVarieties(mainVariety, grafts).length > 1;
}

/** The same variety, as the library compares names. */
export function sameVariety(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

/**
 * When each variety on a tree was picked out, by variety name, the tree's
 * own first. Two growing grafts of one variety close together, so the
 * later date stands for both.
 */
export function varietyCompletions(
  mainVariety: string | null | undefined,
  mainCompletedOn: string | null,
  grafts: readonly { variety: string; status: GraftStatus; harvest_completed_on: string | null }[]
): Array<{ variety: string; completedOn: string | null }> {
  return treeVarieties(mainVariety, grafts).map((variety) => {
    if (sameVariety(variety, mainVariety)) return { variety, completedOn: mainCompletedOn };
    const dates = growingGrafts(grafts)
      .filter((g) => sameVariety(g.variety, variety))
      .map((g) => g.harvest_completed_on);
    const completedOn = dates.some((d) => d === null)
      ? null
      : (dates as string[]).sort().at(-1) ?? null;
    return { variety, completedOn };
  });
}

/**
 * The day the whole tree counts as picked out in `year`, or null while any
 * variety on it still has fruit to come.
 *
 * It is the day the last variety was finished: a tree whose Chehalis came
 * off in early September and its Gala at the end of the month was picked
 * out at the end of the month. A variety closed in an earlier year counts
 * as open, as a one-variety tree does.
 */
export function wholeTreeCompletedOn(
  completions: readonly { completedOn: string | null }[],
  year: number
): string | null {
  if (completions.length === 0) return null;
  let latest: string | null = null;
  for (const { completedOn } of completions) {
    if (!completedOn || !isHarvestComplete(completedOn, year)) return null;
    if (latest === null || completedOn > latest) latest = completedOn;
  }
  return latest;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What is wrong with a graft, as sentences for the form; empty when it can
 * be saved. `today` is the grower's calendar day.
 */
export function graftProblems(input: GraftInput, today: string): string[] {
  const problems: string[] = [];
  if (!input.variety.trim()) problems.push('Say which variety was grafted.');
  if (input.grafted_on) {
    if (!YMD.test(input.grafted_on)) problems.push('The graft date is not a date.');
    else if (input.grafted_on > today) problems.push('A graft cannot be dated in the future.');
  }
  if (input.status_on) {
    if (!YMD.test(input.status_on)) problems.push('The status date is not a date.');
    else if (input.status_on > today) problems.push('The status cannot be dated in the future.');
    else if (input.grafted_on && YMD.test(input.grafted_on) && input.status_on < input.grafted_on) {
      problems.push('The graft cannot fail or be cut out before it was grafted.');
    }
  }
  return problems;
}
