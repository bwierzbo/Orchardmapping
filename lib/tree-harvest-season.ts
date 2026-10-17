/**
 * What one tree has given this season, and whether it is finished.
 *
 * A tree is rarely picked in one go. The early fruit comes off first, the
 * rest a week or two later, and the stragglers after that -- so a season is
 * a list of picks added together, and "done" is something the grower says,
 * not something a total can tell you. A tree that gave 40 lb might be
 * finished or might be half picked.
 *
 * Kept apart from the database module so the arithmetic can be tested, and
 * so the form can read it without pulling a Postgres client into the browser.
 */

import {
  bushelPounds,
  describeHarvest,
  HARVEST_UNITS,
  KG_PER_LB,
  round1,
  type HarvestUnit,
} from './harvest-units';

/** One pick off one tree, as the client reads it. */
export interface TreePick {
  id: number;
  /** YYYY-MM-DD. */
  harvest_date: string;
  /** As entered. Null only for a row written without one. */
  quantity: number | null;
  unit: HarvestUnit | null;
  /** The normalised weight, which is what gets added up. */
  weight_lbs: number;
}

export interface HarvestSeason {
  year: number;
  /** This season's picks, newest first, each with how it reads back. */
  picks: (TreePick & { detail: string })[];
  total_lbs: number;
  total_kg: number;
  total_bushels: number;
  /** The bushel weight the total was divided by, for this tree's fruit. */
  bushel_lb: number;
  /** When the tree was marked finished, if it was -- in any year. */
  completed_on: string | null;
  /** Finished THIS season. Last year's "complete" says nothing about now. */
  complete: boolean;
}

/** The calendar year of a YYYY-MM-DD date, or null if it is not one. */
function yearOf(ymd: string | null | undefined): number | null {
  if (!ymd) return null;
  const match = /^(\d{4})-\d{2}-\d{2}/.exec(ymd);
  return match ? Number(match[1]) : null;
}

/**
 * Whether a tree marked finished on `completedOn` is finished for `year`.
 *
 * A season is a calendar year. The date is the whole record -- there is no
 * separate flag -- so a tree closed last October opens again on its own in
 * January, and nobody has to remember to reopen every tree in the orchard.
 */
export function isHarvestComplete(completedOn: string | null | undefined, year: number): boolean {
  return yearOf(completedOn) === year;
}

/** The map's harvest filter: every tree, those still to pick, or those picked out. */
export type HarvestFilter = 'all' | 'open' | 'complete';

/** The trees picked out in `year`, by tree_id. */
export function pickedOutIds(
  trees: readonly { tree_id: string; harvest_completed_on?: string | null }[],
  year: number,
): Set<string> {
  const done = new Set<string>();
  for (const t of trees) {
    if (isHarvestComplete(t.harvest_completed_on, year)) done.add(t.tree_id);
  }
  return done;
}

/**
 * The trees a harvest filter leaves off the map. "To pick" hides the
 * picked-out ones and "Picked out" hides the rest; "All" hides nothing.
 */
export function hiddenByHarvest(
  trees: readonly { tree_id: string }[],
  pickedOut: ReadonlySet<string>,
  filter: HarvestFilter,
): string[] {
  if (filter === 'all') return [];
  return trees
    .filter((t) => pickedOut.has(t.tree_id) !== (filter === 'complete'))
    .map((t) => t.tree_id);
}

/**
 * Add up one tree's picks for a season.
 *
 * Only picks dated in `year` count. The total is the sum of the stored
 * pounds, not of the entered figures: 2 bushels and 30 kg cannot be added
 * as entered, and the weight is what was converted on the day with the
 * bushel figure for this fruit. Kilograms and bushels are worked back from
 * that one total, so the three never disagree with each other.
 */
export function harvestSeason(
  picks: readonly TreePick[],
  year: number,
  fruitType: string | null | undefined,
  completedOn: string | null | undefined,
): HarvestSeason {
  const season = picks
    .filter((p) => yearOf(p.harvest_date) === year)
    .sort((a, b) => b.harvest_date.localeCompare(a.harvest_date) || b.id - a.id);
  const lbs = season.reduce((sum, p) => sum + p.weight_lbs, 0);
  const bushelLb = bushelPounds(fruitType);
  return {
    year,
    picks: season.map((p) => ({ ...p, detail: describePick(p, fruitType) })),
    total_lbs: round1(lbs),
    total_kg: round1(lbs * KG_PER_LB),
    total_bushels: round1(lbs / bushelLb),
    bushel_lb: bushelLb,
    completed_on: completedOn ?? null,
    complete: isHarvestComplete(completedOn, year),
  };
}

/**
 * A pick as the grower said it. A row with no entered figure has only its
 * weight to show, so it says that rather than inventing a unit.
 */
function describePick(p: TreePick, fruitType: string | null | undefined): string {
  if (p.quantity === null || p.unit === null) return `${p.weight_lbs} lb`;
  return describeHarvest(p.quantity, p.unit, fruitType);
}

/** A stored unit, or null for one this code does not know. */
export function asHarvestUnit(value: unknown): HarvestUnit | null {
  return (HARVEST_UNITS as readonly unknown[]).includes(value) ? (value as HarvestUnit) : null;
}
