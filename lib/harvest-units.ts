/**
 * What a grower says a harvest weighed, and what it weighs.
 *
 * Nobody picking apples counts pounds. They count bushels, or they put the
 * bin on a scale that reads kilograms, and either way the number they say is
 * the number that should be stored -- a recorded 3 that reads back as 126 is
 * not the same record. So the entered quantity and unit are kept as given,
 * and this converts a normalised weight alongside them for anything that has
 * to add harvests together.
 */

export const HARVEST_UNITS = ['bushel', 'lb', 'kg'] as const;
export type HarvestUnit = (typeof HARVEST_UNITS)[number];

export const KG_PER_LB = 0.45359237;

/**
 * Pounds in a bushel, by fruit.
 *
 * A bushel is a volume, so its weight depends on what fills it. These are
 * the USDA handbook figures for the fruit this orchard grows. Anything not
 * listed falls back to the apple figure, which is a guess and is marked as
 * one rather than hidden -- a bushel of quince is not a measure anyone uses.
 */
export const BUSHEL_LB: Record<string, number> = {
  apple: 42,
  pear: 50,
  plum: 56,
};

export const DEFAULT_BUSHEL_LB = BUSHEL_LB.apple;

/** The pounds in a bushel of this fruit, falling back to apples. */
export function bushelPounds(fruitType?: string | null): number {
  if (!fruitType) return DEFAULT_BUSHEL_LB;
  return BUSHEL_LB[fruitType.trim().toLowerCase()] ?? DEFAULT_BUSHEL_LB;
}

/**
 * The entered quantity in pounds.
 *
 * Returns null rather than 0 for anything that is not a usable number: a
 * harvest of nothing is not a harvest, and storing 0 would make it look like
 * a tree that was picked and yielded none.
 */
export function toPounds(
  quantity: number,
  unit: HarvestUnit,
  fruitType?: string | null,
): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  switch (unit) {
    case 'lb':
      return round1(quantity);
    case 'kg':
      return round1(quantity / KG_PER_LB);
    case 'bushel':
      return round1(quantity * bushelPounds(fruitType));
  }
}

/** One decimal, matching the DECIMAL(10,1) the column stores. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** How the entered figure reads back, e.g. "3 bushels (126 lb)". */
export function describeHarvest(
  quantity: number,
  unit: HarvestUnit,
  fruitType?: string | null,
): string {
  const lbs = toPounds(quantity, unit, fruitType);
  const said =
    unit === 'bushel'
      ? `${quantity} bushel${quantity === 1 ? '' : 's'}`
      : `${quantity} ${unit}`;
  if (lbs === null) return said;
  // Saying "42 lb (42 lb)" helps nobody.
  if (unit === 'lb') return said;
  return `${said} (${lbs} lb)`;
}
