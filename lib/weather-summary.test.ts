import { describe, it, expect } from 'vitest';
import { buildSeasonSummary } from './weather-summary';
import type { HourTemp } from './chill';

function day(ymd: string, tempC: number): HourTemp[] {
  return Array.from({ length: 24 }, (_, h) => ({
    ts: `${ymd}T${String(h).padStart(2, '0')}:00`,
    tempC,
  }));
}

describe('buildSeasonSummary', () => {
  it('assembles chill, gdd, and milestones from the two hour ranges', () => {
    const chillWindowHours = [
      ...day('2025-11-01', 5), // 24 chill hours, some portions progress
      ...day('2025-11-02', 5),
    ];
    // Warm June days: 38 DD/day at the 88°F cap
    const yearHours: HourTemp[] = [];
    for (let d = 1; d <= 12; d++) {
      yearHours.push(...day(`2026-06-${String(d).padStart(2, '0')}`, 31.11));
    }

    const s = buildSeasonSummary({
      asOfYmd: '2026-09-10',
      chillWindowHours,
      yearHours,
      avgChillHours: 1200,
      avgGdd: 400,
      priorYears: 5,
      dataThrough: '2026-09-10T05:00',
    });

    expect(s.chill.seasonLabel).toBe('2025–26');
    expect(s.chill.hours).toBe(48);
    expect(s.chill.portions).toBeGreaterThan(0);
    expect(s.chill.complete).toBe(true); // Sept as-of: window closed Apr 30
    expect(s.gdd.year).toBe(2026);
    expect(s.gdd.value).toBeCloseTo(456, 0); // 12 days × 38 DD
    expect(s.milestones[0]).toMatchObject({ dd: 375, date: '2026-06-10' });
    expect(s.milestones[1]).toMatchObject({ dd: 425, date: '2026-06-12' });
    expect(s.milestones[2].date).toBeNull();
    expect(s.priorYears).toBe(5);
  });

  it('marks an in-progress chill season as not complete', () => {
    const s = buildSeasonSummary({
      asOfYmd: '2026-01-15',
      chillWindowHours: [],
      yearHours: [],
      avgChillHours: null,
      avgGdd: null,
      priorYears: 0,
      dataThrough: null,
    });
    expect(s.chill.complete).toBe(false);
    expect(s.chill.portions).toBe(0);
    expect(s.gdd.value).toBe(0);
  });
});
