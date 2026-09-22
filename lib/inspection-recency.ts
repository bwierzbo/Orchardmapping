/**
 * How recently each tree was actually looked at.
 *
 * Status colouring answers "what is wrong". This answers "what do I
 * know", which is a different and often more urgent question: an orchard
 * where 475 of 480 trees have never been inspected does not have 475
 * healthy trees, it has 475 unknowns wearing the same colour.
 */

export const RECENCY_BANDS = ['fresh', 'recent', 'ageing', 'stale', 'never'] as const;
export type RecencyBand = (typeof RECENCY_BANDS)[number];

/**
 * A single hue, fading with age, because recency is ordered rather than
 * categorical — and because red/green would read as "bad/good" when it
 * means "old/new". "Never" is deliberately outside the ramp: it is the
 * absence of an observation, not a very old one.
 */
export const BAND_STYLE: Record<RecencyBand, { label: string; fill: string; ring: string }> = {
  fresh:  { label: 'This week',       fill: '#1F6B3F', ring: '#FFFFFF' },
  recent: { label: 'Recent',          fill: '#4E9B6B', ring: '#FFFFFF' },
  ageing: { label: 'Getting on',      fill: '#9CC4AC', ring: '#FFFFFF' },
  stale:  { label: 'Long time',       fill: '#D8E4DC', ring: '#FFFFFF' },
  // Hollow rather than dark: an empty ring reads as missing data at a
  // glance and does not depend on telling two greens apart.
  never:  { label: 'Never inspected', fill: '#F2ECE4', ring: '#B9451D' },
};

/**
 * Band widths in days, tighter in the growing season.
 *
 * A week without looking at a block is a long time during bloom and
 * irrelevant in January, so the same gap should not be coloured the same
 * way in both. The dormant window comes from the region, so this follows
 * whatever that region says its winter is.
 */
export interface RecencyBands {
  freshDays: number;
  recentDays: number;
  ageingDays: number;
}

export const GROWING_SEASON_BANDS: RecencyBands = { freshDays: 7, recentDays: 21, ageingDays: 60 };
export const DORMANT_BANDS: RecencyBands = { freshDays: 30, recentDays: 90, ageingDays: 180 };

/** True when `ymd` falls inside the region's chill (dormant) window. */
export function isDormant(ymd: string, chillStartMmdd: string, chillEndMmdd: string): boolean {
  const mmdd = ymd.slice(5);
  // A window that straddles the year end covers either side of it.
  return chillStartMmdd > chillEndMmdd
    ? mmdd >= chillStartMmdd || mmdd <= chillEndMmdd
    : mmdd >= chillStartMmdd && mmdd <= chillEndMmdd;
}

/** Whole days between two YYYY-MM-DD dates, ignoring clocks entirely. */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const ms = Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function bandFor(
  lastInspectedYmd: string | null,
  todayYmd: string,
  bands: RecencyBands
): RecencyBand {
  if (!lastInspectedYmd) return 'never';
  const age = daysBetween(lastInspectedYmd, todayYmd);
  // A date in the future is somebody's typo, not a fresh inspection, but
  // treating it as stale would hide it. Fresh is the honest reading.
  if (age <= bands.freshDays) return 'fresh';
  if (age <= bands.recentDays) return 'recent';
  if (age <= bands.ageingDays) return 'ageing';
  return 'stale';
}

/** Counts per band, for a legend that says how much of each there is. */
export function bandCounts(
  lastByTree: ReadonlyMap<string, string | null>,
  treeIds: readonly string[],
  todayYmd: string,
  bands: RecencyBands
): Record<RecencyBand, number> {
  const counts = Object.fromEntries(RECENCY_BANDS.map((b) => [b, 0])) as Record<RecencyBand, number>;
  for (const id of treeIds) {
    counts[bandFor(lastByTree.get(id) ?? null, todayYmd, bands)]++;
  }
  return counts;
}
