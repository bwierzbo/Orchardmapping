import { describe, it, expect } from 'vitest';
import {
  gdd50,
  gddTotal,
  milestoneDates,
  ddCrossingDates,
  cToF,
  CODLING_MOTH_MODEL,
  LEAFROLLER_MODEL,
} from './gdd';
import type { HourTemp } from './chill';

function day(ymd: string, tempC: number): HourTemp[] {
  return Array.from({ length: 24 }, (_, h) => ({
    ts: `${ymd}T${String(h).padStart(2, '0')}:00`,
    tempC,
  }));
}

describe('gdd50', () => {
  it('a full day at 60°F contributes 10 DD', () => {
    const tempC = (60 - 32) * (5 / 9);
    expect(gdd50(day('2026-05-01', tempC))).toBeCloseTo(10, 5);
  });

  it('temperatures at or below 50°F contribute nothing', () => {
    expect(gdd50(day('2026-01-15', 5))).toBe(0); // 41°F
    expect(gdd50(day('2026-01-16', 10))).toBe(0); // 50°F exactly
  });

  it('caps at 88°F: a 100°F day counts as an 88°F day', () => {
    const hot = gdd50(day('2026-07-01', (100 - 32) * (5 / 9)));
    const capped = gdd50(day('2026-07-01', (88 - 32) * (5 / 9)));
    expect(hot).toBeCloseTo(capped, 5);
    expect(capped).toBeCloseTo(38, 5);
  });

  it('cToF converts correctly', () => {
    expect(cToF(0)).toBe(32);
    expect(cToF(100)).toBe(212);
  });
});

describe('milestoneDates', () => {
  it('reports the local date each threshold is crossed, null when not reached', () => {
    // 38 DD/day (88°F-capped days): 375 DD crossed on day 10, 425 on day 12
    const hours: HourTemp[] = [];
    for (let d = 1; d <= 20; d++) {
      hours.push(...day(`2026-06-${String(d).padStart(2, '0')}`, 31.11)); // ~88°F
    }
    const hits = milestoneDates(hours);
    expect(hits[0]).toMatchObject({ dd: 375, date: '2026-06-10' });
    expect(hits[1]).toMatchObject({ dd: 425, date: '2026-06-12' });
    expect(hits[2]).toMatchObject({ dd: 1400, date: null }); // 20 days × 38 = 760
  });

  it('returns all nulls for a cold year-to-date', () => {
    const hits = milestoneDates(day('2026-01-01', 4));
    expect(hits.every((h) => h.date === null)).toBe(true);
  });
});

describe('ddCrossingDates', () => {
  // 38 DD/day at a flat 88°F (capped), so totals are easy to reason about
  const season = Array.from({ length: 40 }, (_, d) =>
    day(`2026-04-${String(d + 1).padStart(2, '0')}`, (88 - 32) * (5 / 9))
  ).flat();

  it('dates every threshold in a single pass', () => {
    // Thresholds deliberately off a day boundary: an exact multiple of
    // the daily total lands on a float knife-edge, and no real
    // degree-day threshold is a round multiple of a day's accumulation.
    const hit = ddCrossingDates(season, [30, 370, 750]);
    expect(hit.get(30)).toBe('2026-04-01');
    expect(hit.get(370)).toBe('2026-04-10');
    expect(hit.get(750)).toBe('2026-04-20');
  });

  it('returns null for a threshold the season never reaches', () => {
    expect(ddCrossingDates(season, [99_999]).get(99_999)).toBeNull();
  });

  it('is order-independent and de-duplicates', () => {
    const hit = ddCrossingDates(season, [750, 30, 750]);
    expect(hit.size).toBe(2);
    expect(hit.get(30)).toBe('2026-04-01');
  });

  it('agrees with milestoneDates on the codling moth thresholds', () => {
    const hit = ddCrossingDates(season, [375, 425, 1400]);
    for (const m of milestoneDates(season)) {
      expect(m.date).toBe(hit.get(m.dd) ?? null);
    }
  });
});

describe('per-insect degree-day models', () => {
  // A day at a flat 60°F: 10 DD base 50, 19 DD base 41.
  const mild = (ymd: string) => day(ymd, (60 - 32) * (5 / 9));

  it('accumulates faster on a lower base — weeks apart over a spring', () => {
    const hours = mild('2026-04-01');
    expect(gddTotal(hours, CODLING_MOTH_MODEL)).toBeCloseTo(10, 1);
    expect(gddTotal(hours, LEAFROLLER_MODEL)).toBeCloseTo(19, 1);
  });

  it('applies each model its own upper cutoff', () => {
    const hot = day('2026-07-01', (100 - 32) * (5 / 9));
    // capped at 88 and 85 respectively
    expect(gddTotal(hot, CODLING_MOTH_MODEL)).toBeCloseTo(38, 1);
    expect(gddTotal(hot, LEAFROLLER_MODEL)).toBeCloseTo(44, 1);
  });

  it('accumulates nothing below the base', () => {
    const cold = day('2026-02-01', (38 - 32) * (5 / 9)); // 38°F
    expect(gddTotal(cold, CODLING_MOTH_MODEL)).toBe(0);
    expect(gddTotal(cold, LEAFROLLER_MODEL)).toBe(0);
  });

  it('ignores everything before a biofix', () => {
    const season = [
      ...mild('2026-04-01'), ...mild('2026-04-02'),
      ...mild('2026-04-03'), ...mild('2026-04-04'),
    ];
    const fromJan = ddCrossingDates(season, [25], LEAFROLLER_MODEL);
    const fromBiofix = ddCrossingDates(season, [25], LEAFROLLER_MODEL, '2026-04-03');
    // 19 DD/day: crossed on day 2 counting from the start, but on the
    // second day AFTER the biofix when counting from it
    expect(fromJan.get(25)).toBe('2026-04-02');
    expect(fromBiofix.get(25)).toBe('2026-04-04');
  });

  it('never reaches a threshold when the biofix is after the weather', () => {
    const season = mild('2026-04-01');
    expect(ddCrossingDates(season, [25], LEAFROLLER_MODEL, '2026-06-01').get(25)).toBeNull();
  });
});
