import { describe, it, expect } from 'vitest';
import { barFor, dayOfYear, daysInYear, monthTicks, pctOfYear } from './season-timeline';

describe('daysInYear', () => {
  it('knows the leap rules, including the century exceptions', () => {
    expect(daysInYear(2026)).toBe(365);
    expect(daysInYear(2028)).toBe(366);
    expect(daysInYear(1900)).toBe(365);
    expect(daysInYear(2000)).toBe(366);
  });
});

describe('dayOfYear', () => {
  it('counts from 1 on January 1', () => {
    expect(dayOfYear('2026-01-01')).toBe(1);
    expect(dayOfYear('2026-12-31')).toBe(365);
  });

  it('accounts for a leap day', () => {
    expect(dayOfYear('2028-03-01')).toBe(61); // 60 in a common year
    expect(dayOfYear('2028-12-31')).toBe(366);
  });

  it('does not shift across a DST boundary', () => {
    // March 8 2026 is the US spring-forward; a local parse would slip
    expect(dayOfYear('2026-03-09') - dayOfYear('2026-03-07')).toBe(2);
  });
});

describe('pctOfYear', () => {
  it('runs 0 at January 1 to just under 100 at December 31', () => {
    expect(pctOfYear('2026-01-01', 2026)).toBe(0);
    expect(pctOfYear('2026-12-31', 2026)).toBeCloseTo(99.7, 1);
    expect(pctOfYear('2026-07-02', 2026)).toBeCloseTo(50, 0);
  });

  it('clamps dates outside the season to the edges', () => {
    expect(pctOfYear('2025-11-01', 2026)).toBe(0);
    expect(pctOfYear('2027-02-28', 2026)).toBe(100);
  });
});

describe('barFor', () => {
  it('places a window inside the season', () => {
    const bar = barFor('2026-09-15', '2026-10-15', 2026)!;
    expect(bar.startPct).toBeCloseTo(70.4, 1);
    expect(bar.widthPct).toBeCloseTo(8.2, 1);
    expect(bar.clippedStart).toBe(false);
    expect(bar.clippedEnd).toBe(false);
  });

  it('runs a window that wraps the new year to the right edge', () => {
    // "Excise cankers November through February" is one window
    const bar = barFor('2026-11-01', '2027-02-28', 2026)!;
    expect(bar.startPct + bar.widthPct).toBe(100);
    expect(bar.clippedEnd).toBe(true);
    expect(bar.clippedStart).toBe(false);
  });

  it('runs an OPEN-ended window to the right edge too', () => {
    // Primary scab, with petal fall not yet marked — we do not know
    // when it closes, and the bar should not pretend otherwise
    const bar = barFor('2026-03-14', null, 2026)!;
    expect(bar.startPct + bar.widthPct).toBe(100);
    expect(bar.clippedEnd).toBe(true);
  });

  it('keeps a one-day window visible', () => {
    const bar = barFor('2026-06-01', '2026-06-01', 2026)!;
    expect(bar.widthPct).toBeGreaterThan(0.5);
  });

  it('has no bar without a start', () => {
    expect(barFor(null, '2026-06-01', 2026)).toBeNull();
  });

  it('has no bar for a window in a later season', () => {
    expect(barFor('2027-03-01', '2027-04-01', 2026)).toBeNull();
  });

  it('rejects a window that ends before it begins', () => {
    expect(barFor('2026-06-01', '2026-05-01', 2026)).toBeNull();
  });
});

describe('monthTicks', () => {
  it('gives twelve evenly-ordered gridlines', () => {
    const ticks = monthTicks(2026);
    expect(ticks).toHaveLength(12);
    expect(ticks[0]).toMatchObject({ label: 'J', name: 'January', pct: 0 });
    expect(ticks[11].name).toBe('December');
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].pct).toBeGreaterThan(ticks[i - 1].pct);
    }
  });
});
