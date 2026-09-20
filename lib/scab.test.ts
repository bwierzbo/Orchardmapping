import { describe, it, expect } from 'vitest';
import {
  findWetPeriods,
  infectionPeriods,
  isWetHour,
  millsRequirement,
} from './scab';
import type { HourWeather } from './weather-hour';

const F = (f: number) => (f - 32) * (5 / 9);

/** `n` consecutive hours at a temperature, wet or dry. */
function hours(
  startTs: string,
  n: number,
  tempF: number,
  opts: { wet?: boolean; rh?: number; precip?: number; lw?: number } = {}
): HourWeather[] {
  const [date, time] = startTs.split('T');
  const h0 = Number(time.slice(0, 2));
  return Array.from({ length: n }, (_, i) => ({
    ts: `${date}T${String(h0 + i).padStart(2, '0')}:00`,
    tempC: F(tempF),
    precipMm: opts.precip ?? (opts.wet ? 1 : 0),
    rhPct: opts.rh ?? (opts.wet ? 95 : 60),
    leafWetnessPct: opts.lw ?? null,
  }));
}

describe('millsRequirement', () => {
  it('needs fewer wet hours as it warms', () => {
    const cool = millsRequirement(45)!;
    const warm = millsRequirement(60)!;
    expect(cool.light).toBeGreaterThan(warm.light);
    expect(warm.light).toBeCloseTo(9.5, 0);
  });

  it('orders light < moderate < severe at every temperature', () => {
    for (const t of [35, 45, 50, 55, 60, 70, 78]) {
      const r = millsRequirement(t)!;
      expect(r.light).toBeLessThan(r.moderate);
      expect(r.moderate).toBeLessThan(r.severe);
    }
  });

  it('interpolates between table rows', () => {
    const at50 = millsRequirement(50)!;
    const at51 = millsRequirement(51)!;
    const between = millsRequirement(50.5)!;
    expect(between.light).toBeGreaterThan(Math.min(at50.light, at51.light) - 0.01);
    expect(between.light).toBeLessThan(Math.max(at50.light, at51.light) + 0.01);
  });

  it('says infection is not possible below freezing-ish', () => {
    expect(millsRequirement(30)).toBeNull();
  });
});

describe('isWetHour', () => {
  const base: HourWeather = {
    ts: '2026-04-01T06:00', tempC: F(50), precipMm: 0, rhPct: 60, leafWetnessPct: null,
  };

  it('counts rain', () => {
    expect(isWetHour({ ...base, precipMm: 0.5 })).toBe(true);
    expect(isWetHour({ ...base, precipMm: 0.1 })).toBe(false);
  });

  it('counts the humid drying tail after rain stops', () => {
    expect(isWetHour({ ...base, rhPct: 95 })).toBe(true);
    expect(isWetHour({ ...base, rhPct: 85 })).toBe(false);
  });

  it('IGNORES the modelled leaf-wetness probability by default', () => {
    // It models dew, not rain: August nights here read 62-64% in a month
    // averaging 6 mm of rain, and a rainy December day read 6%. Trusting
    // it would call wetness all summer and miss spring rain.
    expect(isWetHour({ ...base, leafWetnessPct: 95 })).toBe(false);
  });

  it('can be switched on for a site that wants it', () => {
    expect(isWetHour({ ...base, leafWetnessPct: 95 }, { leafWetnessPct: 70 })).toBe(true);
  });
});

describe('findWetPeriods', () => {
  it('scores a long cool wet spell as an infection', () => {
    // 15 h at 50°F — light needs 14, moderate 19
    const p = findWetPeriods(hours('2026-04-10T00:00', 15, 50, { wet: true }));
    expect(p).toHaveLength(1);
    expect(p[0].wetHours).toBe(15);
    expect(p[0].severity).toBe('light');
    expect(p[0].meanTempF).toBeCloseTo(50, 0);
  });

  it('scores the same hours warmer as more severe', () => {
    // 15 h at 60°F — light 9.5, moderate 13, severe 20
    const p = findWetPeriods(hours('2026-05-10T00:00', 15, 60, { wet: true }));
    expect(p[0].severity).toBe('moderate');
    expect(p[0].hoursToNext).toBeCloseTo(5, 0);
  });

  it('does not call an infection on a short wet spell', () => {
    const p = findWetPeriods(hours('2026-04-10T00:00', 5, 50, { wet: true }));
    expect(p[0].severity).toBe('none');
    expect(infectionPeriods(hours('2026-04-10T00:00', 5, 50, { wet: true }))).toEqual([]);
  });

  it('bridges a short dry gap rather than splitting the period', () => {
    // Leaves stay wet in shade through a gap a gauge reads as dry
    const run = [
      ...hours('2026-04-10T00:00', 8, 50, { wet: true }),
      ...hours('2026-04-10T08:00', 2, 50, { wet: false }),
      ...hours('2026-04-10T10:00', 8, 50, { wet: true }),
    ];
    const p = findWetPeriods(run);
    expect(p).toHaveLength(1);
    expect(p[0].wetHours).toBe(18);
    // The point of bridging: 8 h and 8 h are each below the 14 h that
    // 50°F needs and would score 'none' apart. Joined, they infect.
    expect(p[0].severity).toBe('light');
    const split = findWetPeriods(run, { breakHours: 0 });
    expect(split.map((x) => x.severity)).toEqual(['none', 'none']);
  });

  it('splits on a long dry gap', () => {
    const run = [
      ...hours('2026-04-10T00:00', 8, 50, { wet: true }),
      ...hours('2026-04-10T08:00', 6, 50, { wet: false }),
      ...hours('2026-04-10T14:00', 8, 50, { wet: true }),
    ];
    expect(findWetPeriods(run)).toHaveLength(2);
  });

  it('does not leave a bridged dry tail inside the period', () => {
    const run = [
      ...hours('2026-04-10T00:00', 6, 50, { wet: true }),
      ...hours('2026-04-10T06:00', 3, 50, { wet: false }),
    ];
    const p = findWetPeriods(run);
    expect(p[0].wetHours).toBe(6);
    expect(p[0].endTs).toBe('2026-04-10T05:00');
  });

  it('finds nothing in a dry run', () => {
    expect(findWetPeriods(hours('2026-07-01T00:00', 24, 75, { wet: false }))).toEqual([]);
  });

  it('filters by minimum severity', () => {
    const run = hours('2026-05-10T00:00', 15, 60, { wet: true }); // moderate
    expect(infectionPeriods(run, 'light')).toHaveLength(1);
    expect(infectionPeriods(run, 'moderate')).toHaveLength(1);
    expect(infectionPeriods(run, 'severe')).toHaveLength(0);
  });
});
