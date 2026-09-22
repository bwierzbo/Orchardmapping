import { describe, it, expect } from 'vitest';
import {
  bandFor,
  bandCounts,
  daysBetween,
  isDormant,
  GROWING_SEASON_BANDS,
  DORMANT_BANDS,
  BAND_STYLE,
  RECENCY_BANDS,
} from './inspection-recency';

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-09-15', '2026-09-22')).toBe(7);
  });

  it('is unaffected by the daylight-saving change in between', () => {
    // 2 Nov 2025 is the US fall-back. A naive millisecond division that
    // ran in local time would give 30.04 days here and round to 30
    // anyway, so the assertion is that it stays exactly 31 whole days.
    expect(daysBetween('2025-10-20', '2025-11-20')).toBe(31);
  });

  it('goes negative for a date in the future', () => {
    expect(daysBetween('2026-09-30', '2026-09-22')).toBe(-8);
  });

  it('crosses a year boundary', () => {
    expect(daysBetween('2025-12-25', '2026-01-05')).toBe(11);
  });
});

describe('isDormant', () => {
  const START = '11-01';
  const END = '04-30';

  it('is dormant inside the rain shadow chill window, on both sides of new year', () => {
    expect(isDormant('2025-11-01', START, END)).toBe(true);
    expect(isDormant('2026-01-15', START, END)).toBe(true);
    expect(isDormant('2026-04-30', START, END)).toBe(true);
  });

  it('is not dormant in the growing season', () => {
    expect(isDormant('2026-05-01', START, END)).toBe(false);
    expect(isDormant('2026-09-22', START, END)).toBe(false);
    expect(isDormant('2026-10-31', START, END)).toBe(false);
  });

  it('handles a window that does not straddle the year end', () => {
    // A southern-hemisphere or short-winter region would say this.
    expect(isDormant('2026-07-15', '06-01', '08-31')).toBe(true);
    expect(isDormant('2026-01-15', '06-01', '08-31')).toBe(false);
  });
});

describe('bandFor', () => {
  const TODAY = '2026-09-22';

  it('has never as its own band, not the far end of the ramp', () => {
    expect(bandFor(null, TODAY, GROWING_SEASON_BANDS)).toBe('never');
  });

  it('walks the growing-season bands in order', () => {
    expect(bandFor('2026-09-22', TODAY, GROWING_SEASON_BANDS)).toBe('fresh'); // today
    expect(bandFor('2026-09-15', TODAY, GROWING_SEASON_BANDS)).toBe('fresh'); // 7, the edge
    expect(bandFor('2026-09-14', TODAY, GROWING_SEASON_BANDS)).toBe('recent'); // 8
    expect(bandFor('2026-09-01', TODAY, GROWING_SEASON_BANDS)).toBe('recent'); // 21, the edge
    expect(bandFor('2026-08-31', TODAY, GROWING_SEASON_BANDS)).toBe('ageing'); // 22
    expect(bandFor('2026-07-24', TODAY, GROWING_SEASON_BANDS)).toBe('ageing'); // 60, the edge
    expect(bandFor('2026-07-23', TODAY, GROWING_SEASON_BANDS)).toBe('stale'); // 61
  });

  it('is more forgiving in the dormant season, for the same gap', () => {
    // Three weeks without a look is "recent" in September and "fresh"
    // in January. That is the whole point of seasonal bands: the same
    // gap does not mean the same thing.
    expect(bandFor('2026-09-01', TODAY, GROWING_SEASON_BANDS)).toBe('recent');
    expect(bandFor('2026-09-01', TODAY, DORMANT_BANDS)).toBe('fresh');
  });

  it('reads a future date as fresh rather than hiding it as stale', () => {
    expect(bandFor('2026-12-25', TODAY, GROWING_SEASON_BANDS)).toBe('fresh');
  });
});

describe('bandCounts', () => {
  it('counts every tree exactly once, including the ones with no events', () => {
    const last = new Map<string, string>([
      ['OBC-001-0033', '2026-09-22'],
      ['OBC-001-0034', '2026-09-01'],
      ['OBC-001-0035', '2026-05-01'],
    ]);
    const ids = ['OBC-001-0033', 'OBC-001-0034', 'OBC-001-0035', 'OBC-001-0036', 'OBC-001-0037'];
    const counts = bandCounts(last, ids, '2026-09-22', GROWING_SEASON_BANDS);

    expect(counts).toEqual({ fresh: 1, recent: 1, ageing: 0, stale: 1, never: 2 });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(ids.length);
  });

  it('reflects the real finn-hall shape: almost everything unvisited', () => {
    const last = new Map<string, string>(
      ['0033', '0034', '0035', '0036', '0037'].map((n) => [`OBC-001-${n}`, '2026-09-22'])
    );
    const ids = Array.from({ length: 480 }, (_, i) => `OBC-001-${String(i).padStart(4, '0')}`);
    const counts = bandCounts(last, ids, '2026-09-22', GROWING_SEASON_BANDS);

    expect(counts.never).toBe(475);
    expect(counts.fresh).toBe(5);
  });
});

describe('BAND_STYLE', () => {
  it('covers every band', () => {
    for (const band of RECENCY_BANDS) {
      expect(BAND_STYLE[band].label).toBeTruthy();
      expect(BAND_STYLE[band].fill).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(BAND_STYLE[band].ring).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('gives never a colour off the age ramp, so it does not read as "very old"', () => {
    const ramp = (['fresh', 'recent', 'ageing', 'stale'] as const).map((b) => BAND_STYLE[b].fill);
    expect(ramp).not.toContain(BAND_STYLE.never.fill);
    // ...and it is the only band that marks itself out with a ring.
    for (const b of ['fresh', 'recent', 'ageing', 'stale'] as const) {
      expect(BAND_STYLE[b].ring).toBe('#FFFFFF');
    }
    expect(BAND_STYLE.never.ring).not.toBe('#FFFFFF');
  });
});
