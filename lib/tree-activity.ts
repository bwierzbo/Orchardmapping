/**
 * What a tree's history says about it now: the last thing done to it, the
 * last time anyone looked at it, and the crop load they saw.
 *
 * The tree panel shows these above the history itself, so somebody who
 * taps a tree learns where it stands without reading the list. Kept out of
 * the component (and away from the database module) so the picking can be
 * tested, and so the browser can use it without a Postgres client.
 */

import { HARVEST_UNITS, type HarvestUnit } from './harvest-units';
import type { HarvestSeason } from './tree-harvest-season';

/** How each event type reads in the panel and its history. */
export const EVENT_LABEL: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  status_change: 'Status changed',
  moved: 'Moved',
  deleted: 'Deleted',
  pruning: 'Pruned',
  spray: 'Sprayed',
  fertilize: 'Fertilized',
  observation: 'Observation',
  harvest: 'Harvested',
  note: 'Note',
  bloom: 'Bloom stage',
  fruit_check: 'Fruit check',
  tree_condition: 'Trunk and scaffolds',
  harvest_readiness: 'Picking verdict',
  harvest_complete: 'Harvest complete',
  harvest_reopened: 'Harvest reopened',
  removed: 'Removed',
  replanted: 'Planted in place of another',
};

/**
 * Event types that count as having looked at the tree.
 *
 * The test is whether the event records something about the tree's
 * CONDITION, not whether somebody stood next to it. Pruning, spray and
 * fertilize record work done; a note can be a reminder to order rootstock.
 * None of those tell you how the tree is, so none of them should make a
 * tree look freshly inspected on the map.
 */
export const INSPECTION_EVENT_TYPES = [
  'observation',
  'bloom',
  'fruit_check',
  'status_change',
  'harvest',
] as const;

/**
 * Changes to the record rather than work in the field. Fixing a typo in
 * the variety or nudging a dot on the map is not "activity" on the tree,
 * and showing it as the last thing that happened would hide what did.
 */
const RECORD_EVENT_TYPES: ReadonlySet<string> = new Set(['created', 'updated', 'moved', 'deleted']);

/** The parts of a history row these read. ClientTreeEvent satisfies it. */
export interface ActivityEvent {
  id: number;
  event_type: string;
  /** YYYY-MM-DD, the day it happened. */
  event_date: string | null;
  /** ISO timestamp of when it was written, to order a day's entries. */
  created_at: string | null;
  /** Survey payloads; a fruit_check carries `{ load: 1-5, ... }`. */
  changes: unknown;
  /** Set when the entry was deleted. The API leaves those out already. */
  undone_at?: string | null;
}

/**
 * Newest first: by the day it happened, then by when it was written, then
 * by id -- so two entries on one day still come out in the order made.
 */
function newestFirst(a: ActivityEvent, b: ActivityEvent): number {
  return (
    (b.event_date ?? '').localeCompare(a.event_date ?? '') ||
    (b.created_at ?? '').localeCompare(a.created_at ?? '') ||
    b.id - a.id
  );
}

function newest<T extends ActivityEvent>(
  events: readonly T[],
  keep: (e: T) => boolean
): T | null {
  const live = events.filter((e) => !e.undone_at && e.event_date && keep(e));
  return live.length === 0 ? null : [...live].sort(newestFirst)[0];
}

/** The last thing done to the tree in the field, of any kind. */
export function latestActivity<T extends ActivityEvent>(events: readonly T[]): T | null {
  return newest(events, (e) => !RECORD_EVENT_TYPES.has(e.event_type));
}

/** The last time anyone recorded how the tree is. */
export function latestInspection<T extends ActivityEvent>(events: readonly T[]): T | null {
  const types: ReadonlySet<string> = new Set(INSPECTION_EVENT_TYPES);
  return newest(events, (e) => types.has(e.event_type));
}

/** The crop load (1-5) from a fruit check, or null if it has none. */
function loadOf(changes: unknown): number | null {
  if (!changes || typeof changes !== 'object') return null;
  const load = (changes as { load?: unknown }).load;
  return typeof load === 'number' && Number.isInteger(load) && load >= 1 && load <= 5
    ? load
    : null;
}

/**
 * The most recent crop load somebody scored, and the day they scored it.
 * A fruit check that only took measurements has no load and is skipped,
 * so it does not hide the score from the check before.
 */
export function latestCropLoad(
  events: readonly ActivityEvent[]
): { load: number; date: string } | null {
  const e = newest(events, (ev) => ev.event_type === 'fruit_check' && loadOf(ev.changes) !== null);
  return e ? { load: loadOf(e.changes)!, date: e.event_date! } : null;
}

/**
 * The unit to state a season's total in: the one most of its picks were
 * entered in, since that is the unit the grower thinks in for this tree.
 * A tie, or a season with nothing in a known unit, falls back to pounds.
 */
export function seasonDisplayUnit(picks: readonly { unit: HarvestUnit | null }[]): HarvestUnit {
  const counts = new Map<HarvestUnit, number>();
  for (const p of picks) if (p.unit) counts.set(p.unit, (counts.get(p.unit) ?? 0) + 1);
  const most = Math.max(0, ...counts.values());
  const leaders = HARVEST_UNITS.filter((u) => most > 0 && counts.get(u) === most);
  return leaders.length === 1 ? leaders[0] : 'lb';
}

/**
 * A season's total as one phrase, e.g. "80 lb picked (1 pick)", or null
 * for a tree nothing has come off this year.
 */
export function describeSeasonTotal(season: HarvestSeason): string | null {
  const n = season.picks.length;
  if (n === 0) return null;
  const unit = seasonDisplayUnit(season.picks);
  const amount =
    unit === 'kg'
      ? `${season.total_kg} kg`
      : unit === 'bushel'
        ? `${season.total_bushels} bushel${season.total_bushels === 1 ? '' : 's'}`
        : `${season.total_lbs} lb`;
  return `${amount} picked (${n} pick${n === 1 ? '' : 's'})`;
}
