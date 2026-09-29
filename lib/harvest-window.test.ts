import { describe, it, expect } from 'vitest';
import { estimatePickDate, harvestSortKey } from './harvest-window';

describe('estimatePickDate', () => {
  it('reads a short month with a qualifier', () => {
    expect(estimatePickDate('early Oct')).toMatchObject({ month: 10, day: 5, label: '≈ 5 Oct' });
    expect(estimatePickDate('mid Oct')).toMatchObject({ month: 10, day: 15 });
    expect(estimatePickDate('late Sep')).toMatchObject({ month: 9, day: 25 });
  });

  it('reads a full month name', () => {
    expect(estimatePickDate('Late September')).toMatchObject({ month: 9, day: 25 });
  });

  it('accepts a hyphen between qualifier and month', () => {
    expect(estimatePickDate('Mid-October')).toMatchObject({ month: 10, day: 15 });
    expect(estimatePickDate('early-mid October')).toMatchObject({ month: 10, day: 15 });
  });

  it('takes the first month of a range, because that is when picking opens', () => {
    const e = estimatePickDate('Late September to mid-October');
    expect(e).toMatchObject({ month: 9, day: 25 });
  });

  it('reads the real library entries', () => {
    // Verbatim from variety_attributes.
    expect(
      estimatePickDate('Late September at WSU Mount Vernon (9/29 mean, 2002-2017); late October in England')
    ).toMatchObject({ month: 9, day: 25 });
    expect(
      estimatePickDate('Mid-October in maritime western Washington (WSU Mount Vernon mean harvest 10/14); late October into November in England')
    ).toMatchObject({ month: 10, day: 15 });
    expect(
      estimatePickDate('Early to early-mid season; August into early September in the PNW')
    ).toMatchObject({ month: 8 });
    expect(
      estimatePickDate('mid-late Oct (WSU Mt Vernon bloom 5/22, harvest 10/18 - the latest of this set)')
    ).toMatchObject({ month: 10, day: 25 });
  });

  it('defaults to mid-month when no qualifier sits against the month', () => {
    expect(estimatePickDate('October')).toMatchObject({ month: 10, day: 15 });
    expect(estimatePickDate('harvested in October most years')).toMatchObject({ day: 15 });
  });

  it('ignores a qualifier too far from the month to belong to it', () => {
    // "Early to early-mid season; August ..." — the qualifier describes the
    // season, not August, and there are 9 characters between them.
    expect(estimatePickDate('early in the season, around August')).toMatchObject({ day: 15 });
  });

  it('gives no estimate for a season word with no month', () => {
    // "Late" means late for its species. It is not a date, and inventing
    // one would put a guess in a column people plan picking from.
    for (const text of ['Late', 'Early', 'Mid-Late', 'Early-Mid', 'Very late']) {
      expect(estimatePickDate(text)).toBeNull();
    }
  });

  it('gives no estimate for blank or missing text', () => {
    expect(estimatePickDate(null)).toBeNull();
    expect(estimatePickDate(undefined)).toBeNull();
    expect(estimatePickDate('')).toBeNull();
    expect(estimatePickDate('   ')).toBeNull();
  });

  it('does not mistake a word containing a month for a month', () => {
    // 'Marlborough' starts with "mar"; a bare prefix match would call it March.
    expect(estimatePickDate('Marlborough seedling')).toBeNull();
    expect(estimatePickDate('Mayflower rootstock')).toBeNull();
  });

  it('orders the year correctly', () => {
    const aug = estimatePickDate('early Aug')!.dayOfYear;
    const sep = estimatePickDate('early Sep')!.dayOfYear;
    const oct = estimatePickDate('early Oct')!.dayOfYear;
    const dec = estimatePickDate('December')!.dayOfYear;
    expect(aug).toBeLessThan(sep);
    expect(sep).toBeLessThan(oct);
    expect(oct).toBeLessThan(dec);
  });

  it('separates early, mid and late within one month', () => {
    const early = estimatePickDate('early Oct')!.dayOfYear;
    const mid = estimatePickDate('mid Oct')!.dayOfYear;
    const late = estimatePickDate('late Oct')!.dayOfYear;
    expect(early).toBeLessThan(mid);
    expect(mid).toBeLessThan(late);
  });
});

describe('harvestSortKey', () => {
  it('sorts by pick date', () => {
    expect(harvestSortKey('early Sep')).toBeLessThan(harvestSortKey('late Oct'));
  });

  it('sorts everything without an estimate last', () => {
    for (const text of ['Late', '', null, 'no idea']) {
      expect(harvestSortKey(text)).toBe(Number.MAX_SAFE_INTEGER);
      expect(harvestSortKey('late Dec')).toBeLessThan(harvestSortKey(text));
    }
  });
});
