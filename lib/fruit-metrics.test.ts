import { describe, it, expect } from 'vitest';
import { METRIC_HELP, MM_PER_INCH, inchesToMm, mmToInches } from './fruit-metrics';
import { FRUIT_METRIC_CATALOG } from './settings';
import { sgToBrix } from './sugar';

describe('inch and millimetre conversion', () => {
  it('uses the exact inch, not an approximation', () => {
    expect(MM_PER_INCH).toBe(25.4);
    expect(inchesToMm(1)).toBe(25.4);
  });

  it('round-trips a fruit-sized measurement', () => {
    // A cider apple around 64 mm.
    expect(inchesToMm(mmToInches(64))).toBeCloseTo(64, 10);
  });

  it('converts the sizes somebody would actually read off a caliper', () => {
    expect(inchesToMm(2)).toBeCloseTo(50.8, 6);
    expect(inchesToMm(2.5)).toBeCloseTo(63.5, 6);
    expect(mmToInches(70)).toBeCloseTo(2.756, 3);
  });

  it('keeps a stored millimetre value one decimal place from inches', () => {
    // What the save path does: canonical mm, rounded to 0.1.
    const stored = Math.round(inchesToMm(2.4) * 10) / 10;
    expect(stored).toBe(61);
  });
});

describe('sugar conversion at the range cider fruit actually picks in', () => {
  it('reads a typical pressing gravity as a plausible Brix', () => {
    // 1.050 SG is an ordinary cider must.
    const brix = Math.round(sgToBrix(1.05) * 10) / 10;
    expect(brix).toBeGreaterThan(11);
    expect(brix).toBeLessThan(13);
  });

  it('rises with gravity', () => {
    expect(sgToBrix(1.06)).toBeGreaterThan(sgToBrix(1.04));
  });
});

describe('what each measurement means', () => {
  it('explains every measurement the walk can ask for', () => {
    // A number scale with no legend is a scale nobody can fill in
    // correctly while standing under a tree.
    for (const metric of FRUIT_METRIC_CATALOG) {
      expect(METRIC_HELP[metric.key], `no help for ${metric.key}`).toBeTruthy();
      expect(METRIC_HELP[metric.key].summary.length).toBeGreaterThan(20);
    }
  });

  it('defines the numbered scales, which are the ones nobody remembers', () => {
    for (const key of ['starch_index', 'seed_color']) {
      expect(METRIC_HELP[key].scale, `no scale for ${key}`).toBeTruthy();
    }
    // The two the owner asked for by name.
    expect(METRIC_HELP.starch_index.scale).toMatch(/\b1\b/);
    expect(METRIC_HELP.starch_index.scale).toMatch(/\b8\b/);
    expect(METRIC_HELP.seed_color.scale).toMatch(/0 = pale/);
    expect(METRIC_HELP.seed_color.scale).toMatch(/1 = mottled/);
    expect(METRIC_HELP.seed_color.scale).toMatch(/2 = fully brown, ripe/);
  });

  it('describes the starch scale in the direction it actually runs', () => {
    // Low = starchy and early, high = ripe. Getting this backwards
    // would have somebody picking months early.
    const scale = METRIC_HELP.starch_index.scale!;
    expect(scale.indexOf('1 =')).toBeLessThan(scale.indexOf('8 ='));
    expect(scale).toMatch(/all starch/);
    expect(scale).toMatch(/fully ripe/);
  });
});
