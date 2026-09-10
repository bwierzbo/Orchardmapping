import { describe, it, expect } from 'vitest';
import { chillPortions, chillHours, chillSeasonWindow, type HourTemp } from './chill';

function constantHours(tempC: number, n: number, startDay = 1): HourTemp[] {
  const hours: HourTemp[] = [];
  for (let i = 0; i < n; i++) {
    const day = startDay + Math.floor(i / 24);
    const hour = i % 24;
    hours.push({
      ts: `2025-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`,
      tempC,
    });
  }
  return hours;
}

describe('chillPortions (Dynamic model)', () => {
  it('accumulates roughly one portion per ~25-30h at optimal chill temperature (6°C)', () => {
    // 240 h at 6°C: literature puts the Dynamic model near 1 portion
    // per ~25-30 chilling hours at optimum → expect ~8, allow slack.
    const p = chillPortions(constantHours(6, 240));
    expect(p).toBeGreaterThan(5.5);
    expect(p).toBeLessThan(10.5);
  });

  it('accumulates nothing in warm weather (20°C)', () => {
    expect(chillPortions(constantHours(20, 240))).toBe(0);
  });

  it('accumulates more slowly at freezing than at optimum', () => {
    const atOptimum = chillPortions(constantHours(6, 480));
    const atFreezing = chillPortions(constantHours(-2, 480));
    expect(atFreezing).toBeLessThan(atOptimum);
  });

  it('is monotonic: more hours never means fewer portions', () => {
    const short = chillPortions(constantHours(4, 200));
    const long = chillPortions(constantHours(4, 400));
    expect(long).toBeGreaterThanOrEqual(short);
  });

  it('returns 0 for empty input', () => {
    expect(chillPortions([])).toBe(0);
  });
});

describe('chillHours (32-45°F)', () => {
  it('counts only hours inside the band', () => {
    const hours = [
      { ts: '2025-11-01T00:00', tempC: -1 }, // below 32°F — out
      { ts: '2025-11-01T01:00', tempC: 0 }, // 32°F — in
      { ts: '2025-11-01T02:00', tempC: 5 }, // in
      { ts: '2025-11-01T03:00', tempC: 7.2 }, // ~45°F — in
      { ts: '2025-11-01T04:00', tempC: 8 }, // above — out
    ];
    expect(chillHours(hours)).toBe(3);
  });
});

describe('chillSeasonWindow', () => {
  it('uses the current year for Nov/Dec dates', () => {
    expect(chillSeasonWindow('2025-12-15')).toEqual({
      start: '2025-11-01',
      end: '2025-12-15',
      label: '2025–26',
    });
  });

  it('uses the prior year for Jan-Oct dates and caps at Apr 30', () => {
    expect(chillSeasonWindow('2026-02-10')).toEqual({
      start: '2025-11-01',
      end: '2026-02-10',
      label: '2025–26',
    });
    expect(chillSeasonWindow('2026-09-10')).toEqual({
      start: '2025-11-01',
      end: '2026-04-30',
      label: '2025–26',
    });
  });
});
