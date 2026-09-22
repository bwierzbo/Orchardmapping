import { describe, it, expect } from 'vitest';
import {
  chillPortions,
  chillHours,
  chillSeasonWindow,
  MARITIME_PNW_CHILL,
  type HourTemp,
} from './chill';

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

describe('chillSeasonWindow across regions', () => {
  it('defaults to what the app assumed before regions existed', () => {
    expect(chillSeasonWindow('2026-02-10')).toEqual(
      chillSeasonWindow('2026-02-10', MARITIME_PNW_CHILL)
    );
  });

  it('opens earlier where a region says chill starts earlier', () => {
    // A continental orchard is banking chill by mid-October; the maritime
    // window would silently drop those hours.
    const w = chillSeasonWindow('2026-02-10', { startMmdd: '10-01', endMmdd: '04-30' });
    expect(w.start).toBe('2025-10-01');
    expect(w.label).toBe('2025–26');
  });

  it('handles a season that does not straddle the year end', () => {
    // Southern hemisphere: chill runs inside one calendar year.
    const w = chillSeasonWindow('2026-08-15', { startMmdd: '05-01', endMmdd: '09-30' });
    expect(w).toEqual({ start: '2026-05-01', end: '2026-08-15', label: '2026' });
  });

  it('caps the end at today, and not beyond the window', () => {
    const mid = chillSeasonWindow('2026-02-10', MARITIME_PNW_CHILL);
    expect(mid.end).toBe('2026-02-10');
    const after = chillSeasonWindow('2026-09-10', MARITIME_PNW_CHILL);
    expect(after.end).toBe('2026-04-30');
  });

  it('puts an autumn date in the season that is opening, not the one that closed', () => {
    const w = chillSeasonWindow('2026-11-15', MARITIME_PNW_CHILL);
    expect(w.start).toBe('2026-11-01');
    expect(w.label).toBe('2026–27');
  });
});
