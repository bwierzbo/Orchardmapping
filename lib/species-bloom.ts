/**
 * Typical full bloom by species, in maritime western Washington.
 *
 * The harvest model counts days from full bloom, and 8 May -- the mean of
 * the eight apple blooms WSU Mount Vernon recorded -- is an APPLE bloom.
 * Cherries here are in flower in the first week of April and plums before
 * them, so anchoring a cherry to 8 May would put its picking a month late.
 *
 * These are anchors of last resort, used only until a bloom is recorded for
 * the variety in question. They are estimates for this coastline, not
 * measurements, and a recorded mark beats every one of them.
 */
import { dayOfYear } from './harvest-target';

/** Species whose bloom this module can place, lowercase as trees store it. */
export const SPECIES_BLOOM_DOY: Record<string, number> = {
  // Stone fruit, earliest first.
  apricot: dayOfYear(3, 25),
  peach: dayOfYear(3, 28),
  cherry: dayOfYear(4, 1),
  plum: dayOfYear(4, 5),
  // Soft fruit.
  currant: dayOfYear(4, 15),
  gooseberry: dayOfYear(4, 15),
  blueberry: dayOfYear(4, 25),
  huckleberry: dayOfYear(5, 1),
  raspberry: dayOfYear(5, 15),
  blackberry: dayOfYear(6, 1),
  // Pome fruit. Apple is the measured one; the rest sit around it.
  pear: dayOfYear(4, 20),
  apple: dayOfYear(5, 8),
  quince: dayOfYear(5, 15),
  medlar: dayOfYear(5, 20),
  persimmon: dayOfYear(5, 25),
  pomegranate: dayOfYear(6, 1),
};

/**
 * Nuts are not counted from bloom. A hazelnut is wind-pollinated in the
 * depth of winter -- catkins shed in January or February -- and the months
 * between that and a filled shell say nothing useful about when to gather.
 * Species listed here are given a picking date directly instead.
 */
export const NOT_BLOOM_ANCHORED = new Set(['hazelnut', 'walnut', 'chestnut']);

/** Fallback when a tree's species is unrecorded. Most of these orchards are apples. */
export const DEFAULT_SPECIES = 'apple';

/**
 * Where to anchor a variety of this species, when no bloom has been
 * recorded for it. Unknown species fall back to apple.
 */
export function bloomDoyForSpecies(species: string | null | undefined): number {
  const key = species?.trim().toLowerCase();
  if (key && SPECIES_BLOOM_DOY[key] !== undefined) return SPECIES_BLOOM_DOY[key];
  return SPECIES_BLOOM_DOY[DEFAULT_SPECIES];
}

export function isBloomAnchored(species: string | null | undefined): boolean {
  return !NOT_BLOOM_ANCHORED.has((species ?? '').trim().toLowerCase());
}
