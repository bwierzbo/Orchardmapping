/**
 * Apple growth stages, and the marks that record when this orchard
 * reached each one.
 *
 * Most of a west-side spray program is anchored to a STAGE, not a date:
 * copper at half-inch green, lime sulfur through bloom, nothing before
 * green tip. A calendar can't place any of that without knowing when
 * the block actually got there, and the answer moves by a fortnight
 * year to year — so it has to be observed, not assumed.
 *
 * One mark per stage per season. The season key is the calendar year,
 * which is safe for the northern-hemisphere apple cycle: dormancy in
 * January through leaf fall in November all fall inside one year.
 */

export const PHENOLOGY_STAGES = [
  'dormant',
  'silver_tip',
  'green_tip',
  'half_inch_green',
  'tight_cluster',
  'pink',
  'first_bloom',
  'full_bloom',
  'petal_fall',
  'fruit_set',
  'harvest',
  'leaf_fall',
] as const;

export type PhenologyStage = (typeof PHENOLOGY_STAGES)[number];

export const PHENOLOGY_LABEL: Record<PhenologyStage, string> = {
  dormant: 'Dormant',
  silver_tip: 'Silver tip',
  green_tip: 'Green tip',
  half_inch_green: 'Half-inch green',
  tight_cluster: 'Tight cluster',
  pink: 'Pink',
  first_bloom: 'First bloom',
  full_bloom: 'Full bloom',
  petal_fall: 'Petal fall',
  fruit_set: 'Fruit set',
  harvest: 'Harvest',
  leaf_fall: 'Leaf fall',
};

/** What the stage looks like, so a mark doesn't need a reference book. */
export const PHENOLOGY_HELP: Record<PhenologyStage, string> = {
  dormant: 'Buds tight and brown, no movement.',
  silver_tip: 'Bud scales part; a sliver of silver-grey tissue shows.',
  green_tip: 'Green leaf tip visible past the bud scales — the season starts here.',
  half_inch_green: 'Green tissue about half an inch out of the bud.',
  tight_cluster: 'Flower buds visible as a tight cluster, still green.',
  pink: 'Cluster elongated, petals showing pink but unopened.',
  first_bloom: 'The king blossom opens.',
  full_bloom: 'About 80% of blossoms open.',
  petal_fall: 'Roughly three-quarters of petals have dropped.',
  fruit_set: 'Fruitlets swelling once the drop has finished.',
  harvest: 'Picking starts.',
  leaf_fall: 'Most leaves down — the autumn wound window opens.',
};

export function isPhenologyStage(value: string): value is PhenologyStage {
  return (PHENOLOGY_STAGES as readonly string[]).includes(value);
}

/** Position in the season, for ordering and for "what comes next". */
export function stageOrder(stage: PhenologyStage): number {
  return PHENOLOGY_STAGES.indexOf(stage);
}

export interface PhenologyMark {
  stage: PhenologyStage;
  /** Local YYYY-MM-DD the orchard reached the stage. */
  observedOn: string;
}

/** The season a date belongs to. Calendar year — see the module note. */
export function seasonOf(ymd: string): number {
  return Number(ymd.slice(0, 4));
}

/**
 * The stage the orchard is in as of a date: the latest mark on or
 * before it, within the same season. Null before the first mark of the
 * year — deliberately not carried over from last season, because a
 * stale "harvest" would otherwise read as the current state all winter.
 */
export function currentStage<T extends PhenologyMark>(
  marks: readonly T[],
  asOfYmd: string
): T | null {
  const season = seasonOf(asOfYmd);
  let best: T | null = null;
  for (const m of marks) {
    if (seasonOf(m.observedOn) !== season) continue;
    if (m.observedOn > asOfYmd) continue;
    if (
      !best ||
      m.observedOn > best.observedOn ||
      (m.observedOn === best.observedOn && stageOrder(m.stage) > stageOrder(best.stage))
    ) {
      best = m;
    }
  }
  return best;
}

/**
 * The stages still unrecorded this season, in order — what the "mark a
 * stage" control offers. Everything at or before the current stage is
 * dropped, so the list shrinks as the season runs.
 */
export function remainingStages(
  marks: readonly PhenologyMark[],
  asOfYmd: string
): PhenologyStage[] {
  const season = seasonOf(asOfYmd);
  const marked = new Set(
    marks.filter((m) => seasonOf(m.observedOn) === season).map((m) => m.stage)
  );
  const current = currentStage(marks, asOfYmd);
  const floor = current ? stageOrder(current.stage) : -1;
  return PHENOLOGY_STAGES.filter((s) => !marked.has(s) && stageOrder(s) > floor);
}

/**
 * When the orchard hit a stage in a given season, or null if it wasn't
 * recorded. This is the lookup the trigger resolver will use to turn
 * "copper at half-inch green" into a date.
 */
export function stageDate(
  marks: readonly PhenologyMark[],
  stage: PhenologyStage,
  season: number
): string | null {
  const hit = marks.find((m) => m.stage === stage && seasonOf(m.observedOn) === season);
  return hit ? hit.observedOn : null;
}

/** Whole days between two YYYY-MM-DD dates, ignoring any zone. */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const ms = Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}
