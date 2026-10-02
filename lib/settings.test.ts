import { describe, it, expect } from 'vitest';
import {
  CONDITION_METRIC_CATALOG,
  DEFAULT_WALK_SETTINGS,
  FRUIT_METRIC_CATALOG,
  normalizeWalkSettings,
} from './settings';

describe('the metric catalogs', () => {
  it('keeps fruit and trunk measurements apart', () => {
    // A canker count is not a fruit characteristic, and putting it under
    // that heading is how it ends up asked for on a sample apple.
    const fruit = FRUIT_METRIC_CATALOG.map((m) => m.key);
    const condition = CONDITION_METRIC_CATALOG.map((m) => m.key);
    expect(fruit.some((k) => condition.includes(k as never))).toBe(false);
  });

  it('gives every metric a label, a unit and a step', () => {
    for (const m of [...FRUIT_METRIC_CATALOG, ...CONDITION_METRIC_CATALOG]) {
      expect(m.label, m.key).toBeTruthy();
      expect(m.unit, m.key).toBeTruthy();
      expect(m.step, m.key).toBeGreaterThan(0);
    }
  });
});

describe('walk settings added for the walk redesign', () => {
  it('asks for starch and seed colour by default', () => {
    // These were off, which meant the one measurement the harvest
    // predictor keys on was the one nobody was asked for.
    expect(DEFAULT_WALK_SETTINGS.fruitMetrics).toContain('starch_index');
    expect(DEFAULT_WALK_SETTINGS.fruitMetrics).toContain('seed_color');
  });

  it('asks for a canker count by default', () => {
    expect(DEFAULT_WALK_SETTINGS.conditionMetrics).toContain('canker_count');
  });

  it('asks for a readiness verdict by default', () => {
    expect(DEFAULT_WALK_SETTINGS.askHarvestReadiness).toBe(true);
  });

  it('keeps asking for readiness when an older stored setting omits it', () => {
    // Settings saved before this existed have no such key; the walk should
    // start asking rather than stay silent forever.
    expect(normalizeWalkSettings({ sugarUnit: 'sg' }).askHarvestReadiness).toBe(true);
  });

  it('lets it be turned off explicitly', () => {
    expect(normalizeWalkSettings({ askHarvestReadiness: false }).askHarvestReadiness).toBe(false);
  });

  it('drops a condition metric it does not recognise', () => {
    expect(
      normalizeWalkSettings({ conditionMetrics: ['canker_count', 'moon_phase'] }).conditionMetrics
    ).toEqual(['canker_count']);
  });

  it('accepts an empty condition list as "do not ask"', () => {
    expect(normalizeWalkSettings({ conditionMetrics: [] }).conditionMetrics).toEqual([]);
  });
});
