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

export const PHENOLOGY_SCOPES = ['orchard', 'variety', 'block'] as const;
export type PhenologyScope = (typeof PHENOLOGY_SCOPES)[number];

export const PHENOLOGY_SCOPE_LABEL: Record<PhenologyScope, string> = {
  orchard: 'The whole orchard',
  variety: 'Each variety',
  block: 'Each block',
};

export interface PhenologyMark {
  stage: PhenologyStage;
  /** Local YYYY-MM-DD the group reached the stage. */
  observedOn: string;
  /**
   * What the observation is about. 'orchard' is one date for
   * everything; 'variety' is one per variety, which is how a block of
   * eighteen cultivars actually behaves.
   */
  scope?: PhenologyScope;
  /** The variety or block name. Null for an orchard-wide mark. */
  scopeValue?: string | null;
}

/**
 * When the EARLIEST and LATEST group reached a stage.
 *
 * A stage is declared for a group when most of it is there — full bloom
 * is defined as 70 to 80% of blossoms open, an averaged classification,
 * not a count of stragglers. So this is a spread across groups, not a
 * spread across trees.
 */
export interface StageSpread {
  earliest: string;
  latest: string;
  /** Group names in the order they arrived, earliest first. */
  order: { group: string; on: string }[];
  /** Days between the first group and the last. */
  spreadDays: number;
}

export function stageSpread(
  marks: readonly PhenologyMark[],
  stage: PhenologyStage,
  season: number
): StageSpread | null {
  const hits = marks
    .filter((m) => m.stage === stage && seasonOf(m.observedOn) === season)
    .map((m) => ({ group: m.scopeValue ?? 'whole orchard', on: m.observedOn }))
    .sort((a, b) => a.on.localeCompare(b.on));
  if (hits.length === 0) return null;
  const earliest = hits[0].on;
  const latest = hits[hits.length - 1].on;
  return { earliest, latest, order: hits, spreadDays: daysBetween(earliest, latest) };
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
 * When the orchard hit a stage, taking the EARLIEST group.
 *
 * Earliest rather than latest, because a protectant has to be on the
 * tree before the tissue is vulnerable. If Kingston Black reaches
 * half-inch green on the 28th and Harrison on the 2nd, spraying the
 * 28th protects both — Harrison simply gets it a few days early, which
 * costs nothing. Spraying the 2nd leaves Kingston Black exposed for
 * five days, which is the whole point of the spray.
 */
export function stageDate(
  marks: readonly PhenologyMark[],
  stage: PhenologyStage,
  season: number
): string | null {
  return stageSpread(marks, stage, season)?.earliest ?? null;
}

/** When the LAST group reached a stage — what closes a window. */
export function stageDateLatest(
  marks: readonly PhenologyMark[],
  stage: PhenologyStage,
  season: number
): string | null {
  return stageSpread(marks, stage, season)?.latest ?? null;
}

/** Whole days between two YYYY-MM-DD dates, ignoring any zone. */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const ms = Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * When a single spray covers every group.
 *
 * Each variety has its own window for a step — Kingston Black reaches
 * half-inch green before Harrison does — and the useful question for a
 * three-acre block is not "when is each variety ready" but "when is
 * there a day that works for all of them". That is the INTERSECTION of
 * the windows: it starts when the last variety arrives and ends when
 * the first one leaves.
 *
 * When the intersection is empty, no single date covers everything and
 * the honest answer is that it takes two passes. Saying so beats
 * averaging the dates and producing one that is wrong for both ends.
 */
export interface OnePassWindow {
  /** Spray any time in here and every placed group is covered. */
  start: string | null;
  end: string | null;
  /** True when the groups cannot be covered by one pass. */
  needsTwoPasses: boolean;
  /** Each group's own window, earliest first. */
  groups: { group: string; start: string; end: string | null }[];
  /** Groups with no mark for the anchoring stage — unknown, not absent. */
  unplaced: string[];
}

export function onePassWindow(
  windows: readonly { group: string; start: string; end: string | null }[],
  unplaced: readonly string[] = []
): OnePassWindow {
  const groups = [...windows].sort((a, b) => a.start.localeCompare(b.start));
  if (groups.length === 0) {
    return { start: null, end: null, needsTwoPasses: false, groups: [], unplaced: [...unplaced] };
  }
  // Latest start, earliest end — the overlap all of them share.
  const start = groups.reduce((a, g) => (g.start > a ? g.start : a), groups[0].start);
  const ends = groups.map((g) => g.end).filter((e): e is string => e !== null);
  // A null end means open-ended, which cannot close the intersection.
  const end = ends.length === groups.length
    ? ends.reduce((a, e) => (e < a ? e : a), ends[0])
    : null;
  return {
    start,
    end,
    needsTwoPasses: end !== null && end < start,
    groups,
    unplaced: [...unplaced],
  };
}

/**
 * Turning per-tree observations into a variety's growth stage.
 *
 * Walk mode has always recorded a bloom stage per tree, and until now it
 * fed nothing — you could mark fifty trees and the programme would
 * still say it was waiting on green tip. Recording as you walk is more
 * natural than remembering to mark from a dashboard, so the walk should
 * be what drives the programme.
 *
 * The rule is the published one: a stage belongs to a group when most
 * of the group is there. Full bloom is defined as 70 to 80% of blossoms
 * open, so 75% of observed trees is the threshold here, and trees you
 * have not looked at are not counted against it — an unobserved tree is
 * unknown, not behind.
 */

/** The label walk mode stores, mapped to a stage key. */
export function stageFromLabel(label: string): PhenologyStage | null {
  const key = label.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return isPhenologyStage(key) ? key : null;
}

export interface TreeStageObservation {
  treeId: string;
  variety: string | null;
  stage: PhenologyStage;
  observedOn: string;
}

export interface VarietyRollUp {
  variety: string;
  /** The stage most of the observed trees have reached. */
  stage: PhenologyStage;
  /** Trees at that stage or beyond. */
  atOrPast: number;
  /** Trees looked at this season. */
  observed: number;
  share: number;
  /** The date the group crossed the threshold — the latest of the
   *  observations that got it there, not the first sighting. */
  reachedOn: string;
  /** True once the share clears the threshold. */
  ready: boolean;
}

/** 70-80% is the published convention; 75 sits in the middle. */
export const ROLLUP_THRESHOLD = 0.75;

/**
 * What each variety's trees say, given one observation per tree — the
 * most advanced stage seen on each, since a tree does not go backwards.
 */
export function rollUpFromTrees(
  observations: readonly TreeStageObservation[],
  season: number,
  threshold = ROLLUP_THRESHOLD
): VarietyRollUp[] {
  const latestPerTree = new Map<string, TreeStageObservation>();
  for (const o of observations) {
    if (seasonOf(o.observedOn) !== season || !o.variety) continue;
    const held = latestPerTree.get(o.treeId);
    // A tree does not go backwards; keep the most advanced sighting.
    if (!held || stageOrder(o.stage) > stageOrder(held.stage)) {
      latestPerTree.set(o.treeId, o);
    }
  }

  const byVariety = new Map<string, TreeStageObservation[]>();
  for (const o of latestPerTree.values()) {
    const list = byVariety.get(o.variety!) ?? [];
    list.push(o);
    byVariety.set(o.variety!, list);
  }

  const out: VarietyRollUp[] = [];
  for (const [variety, trees] of byVariety) {
    const observed = trees.length;
    // The furthest stage that still has enough trees at or past it.
    let best: VarietyRollUp | null = null;
    for (const stage of PHENOLOGY_STAGES) {
      const at = trees.filter((t) => stageOrder(t.stage) >= stageOrder(stage));
      if (at.length === 0) continue;
      const share = at.length / observed;
      const reachedOn = at
        .map((t) => t.observedOn)
        .sort()
        .at(-1)!;
      const candidate: VarietyRollUp = {
        variety,
        stage,
        atOrPast: at.length,
        observed,
        share,
        reachedOn,
        ready: share >= threshold,
      };
      // Prefer the furthest stage that still clears the threshold;
      // fall back to the furthest reached at all.
      if (candidate.ready) best = candidate;
      else if (!best) best = candidate;
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => a.variety.localeCompare(b.variety));
}

/**
 * Roll-ups worth acting on: a variety whose trees have moved past what
 * the programme currently believes, and by enough to call it.
 */
export function rollUpSuggestions(
  rollUps: readonly VarietyRollUp[],
  marks: readonly PhenologyMark[],
  season: number
): VarietyRollUp[] {
  return rollUps.filter((r) => {
    if (!r.ready) return false;
    const marked = marks.filter(
      (m) => seasonOf(m.observedOn) === season && (m.scopeValue ?? null) === r.variety
    );
    const furthest = marked.reduce(
      (acc, m) => Math.max(acc, stageOrder(m.stage)),
      -1
    );
    return stageOrder(r.stage) > furthest;
  });
}
