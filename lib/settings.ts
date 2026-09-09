/**
 * User-scoped configuration — the "capability-complete,
 * configuration-scoped" foundation. Every capability ships; the setup
 * page (/settings) scopes what each operation actually sees, whether
 * it's a 500-tree block or a 500-acre operation.
 *
 * Defaults live here in code; app_settings rows override per key.
 */

export const BLOOM_STAGES_SIMPLE = [
  'Dormant',
  'Green Tip',
  'Tight Cluster',
  'Pink',
  'Full Bloom',
  'Petal Fall',
] as const;

export const BLOOM_STAGES_FULL = [
  'Dormant',
  'Silver Tip',
  'Green Tip',
  'Half-Inch Green',
  'Tight Cluster',
  'Pink',
  'First Bloom',
  'Full Bloom',
  'Petal Fall',
  'Fruit Set',
] as const;

/** Everything the app can measure on fruit; users enable a subset. */
export const FRUIT_METRIC_CATALOG = [
  { key: 'brix', label: 'Brix (refractometer)', unit: '°Bx', step: 0.1 },
  { key: 'size_mm', label: 'Fruit size', unit: 'mm', step: 1 },
  { key: 'firmness', label: 'Firmness (penetrometer)', unit: 'lbf', step: 0.1 },
  { key: 'starch_index', label: 'Starch-iodine index', unit: '1–8', step: 0.5 },
  { key: 'seed_color', label: 'Seed color (0–2)', unit: '0–2', step: 1 },
  { key: 'drop_count', label: 'Ground drops under tree', unit: 'count', step: 1 },
] as const;

export type FruitMetricKey = (typeof FRUIT_METRIC_CATALOG)[number]['key'];

export interface WalkSettings {
  /** Phenology ladder granularity for bloom passes. */
  bloomScale: 'simple' | 'full';
  /** Survey every tree, or sample the first N trees of each variety run. */
  surveyScope: 'per_tree' | 'variety_sample';
  sampleSize: number;
  /** Which fruit measurements the fruit pass asks for. */
  fruitMetrics: FruitMetricKey[];
  /** How sugar content is entered/displayed: refractometer °Bx or SG. */
  sugarUnit: 'brix' | 'sg';
}

export const DEFAULT_WALK_SETTINGS: WalkSettings = {
  bloomScale: 'simple',
  surveyScope: 'per_tree',
  sampleSize: 3,
  fruitMetrics: ['brix', 'size_mm'],
  sugarUnit: 'brix',
};

export function bloomStagesFor(settings: WalkSettings): readonly string[] {
  return settings.bloomScale === 'full' ? BLOOM_STAGES_FULL : BLOOM_STAGES_SIMPLE;
}

/** Merge a stored partial value over the defaults, discarding junk. */
export function normalizeWalkSettings(stored: unknown): WalkSettings {
  const s = (stored ?? {}) as Partial<WalkSettings>;
  const validMetrics = new Set(FRUIT_METRIC_CATALOG.map((m) => m.key));
  return {
    bloomScale: s.bloomScale === 'full' ? 'full' : DEFAULT_WALK_SETTINGS.bloomScale,
    surveyScope:
      s.surveyScope === 'variety_sample' ? 'variety_sample' : DEFAULT_WALK_SETTINGS.surveyScope,
    sampleSize:
      typeof s.sampleSize === 'number' && s.sampleSize >= 1 && s.sampleSize <= 50
        ? Math.round(s.sampleSize)
        : DEFAULT_WALK_SETTINGS.sampleSize,
    fruitMetrics: Array.isArray(s.fruitMetrics)
      ? (s.fruitMetrics.filter((m): m is FruitMetricKey => validMetrics.has(m as FruitMetricKey)))
      : DEFAULT_WALK_SETTINGS.fruitMetrics,
    sugarUnit: s.sugarUnit === 'sg' ? 'sg' : DEFAULT_WALK_SETTINGS.sugarUnit,
  };
}
