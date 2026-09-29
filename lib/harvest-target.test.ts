import { describe, it, expect } from 'vitest';
import {
  PURPOSE_WINDOW,
  PURPOSE_TARGETS,
  REGIONAL_BLOOM_DOY,
  dayOfYear,
  parseBloomHarvestPair,
  deriveDaysFromBloom,
  harvestWindowFor,
} from './harvest-target';

const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe('PURPOSE_WINDOW', () => {
  it('opens and closes a fresh window evenly', () => {
    expect(PURPOSE_WINDOW.fresh).toEqual({ leadDays: 5, tailDays: 5 });
  });

  it('gives cider a long tail and the same short lead', () => {
    // Early is the failure for cider; late is usable and drops still press.
    expect(PURPOSE_WINDOW.cider.leadDays).toBe(5);
    expect(PURPOSE_WINDOW.cider.tailDays).toBe(13);
    expect(PURPOSE_WINDOW.cider.tailDays).toBeGreaterThan(PURPOSE_WINDOW.cider.leadDays);
  });

  it('gives cider the wider window of the two', () => {
    const width = (p: 'cider' | 'fresh') => PURPOSE_WINDOW[p].leadDays + PURPOSE_WINDOW[p].tailDays;
    expect(width('cider')).toBe(18);
    expect(width('fresh')).toBe(10);
  });
});

describe('PURPOSE_TARGETS', () => {
  it('wants cider fruit riper than eating fruit', () => {
    expect(PURPOSE_TARGETS.cider.starchIndex).toBeGreaterThan(PURPOSE_TARGETS.fresh.starchIndex);
  });

  it('keeps both targets on the 1-8 scale the inspection form uses', () => {
    for (const t of Object.values(PURPOSE_TARGETS)) {
      expect(t.starchIndex).toBeGreaterThanOrEqual(1);
      expect(t.starchIndex).toBeLessThanOrEqual(8);
    }
  });
});

describe('dayOfYear', () => {
  it('counts from the first of January', () => {
    expect(dayOfYear(1, 1)).toBe(1);
    expect(dayOfYear(2, 1)).toBe(32);
    expect(dayOfYear(12, 31)).toBe(365);
  });

  it('agrees with the WSU dates the library records', () => {
    expect(dayOfYear(5, 12)).toBe(132); // Kingston Black bloom
    expect(dayOfYear(9, 30)).toBe(273); // Kingston Black harvest
  });
});

describe('parseBloomHarvestPair', () => {
  it('reads a real library entry', () => {
    const pair = parseBloomHarvestPair(
      'late Sep-early Oct (WSU Mt Vernon bloom 5/19, harvest 9/30); late Oct-Nov in England'
    );
    expect(pair).toEqual({ bloomDoy: dayOfYear(5, 19), harvestDoy: dayOfYear(9, 30) });
  });

  it('needs both halves of the pair', () => {
    expect(parseBloomHarvestPair('WSU Mt Vernon harvest 10/14')).toBeNull();
    expect(parseBloomHarvestPair('WSU Mt Vernon bloom 5/8')).toBeNull();
  });

  it('rejects a harvest that precedes its bloom', () => {
    // One northern season: a harvest before bloom means the pattern has
    // caught two numbers out of different sentences.
    expect(parseBloomHarvestPair('bloom 10/9, harvest 5/16')).toBeNull();
  });

  it('rejects an impossible month', () => {
    expect(parseBloomHarvestPair('bloom 13/1, harvest 14/2')).toBeNull();
  });

  it('is null for text with no pair at all', () => {
    expect(parseBloomHarvestPair('Late')).toBeNull();
    expect(parseBloomHarvestPair(null)).toBeNull();
    expect(parseBloomHarvestPair('')).toBeNull();
  });
});

describe('deriveDaysFromBloom', () => {
  it('measures the interval when both dates are recorded', () => {
    const t = deriveDaysFromBloom(
      'late Sep-early Oct (WSU Mt Vernon bloom 5/12, harvest 9/30); mid-late Oct in England'
    );
    // Kingston Black: 273 - 132.
    expect(t).toMatchObject({ daysFromBloom: 141, basis: 'wsu_paired' });
  });

  it('prefers a measured pair over a date in the surrounding prose', () => {
    // The text opens with "late Sep", which would derive a weaker number.
    const t = deriveDaysFromBloom('late Sep (WSU Mt Vernon bloom 5/13, harvest 9/26)');
    expect(t!.basis).toBe('wsu_paired');
    expect(t!.daysFromBloom).toBe(dayOfYear(9, 26) - dayOfYear(5, 13));
  });

  it('falls back to a harvest date in the text against the regional bloom', () => {
    const t = deriveDaysFromBloom('mid Oct');
    expect(t).toMatchObject({ basis: 'text_date' });
    expect(t!.daysFromBloom).toBe(dayOfYear(10, 15) - REGIONAL_BLOOM_DOY);
  });

  it('falls back again to a season word, and says that is all it had', () => {
    const t = deriveDaysFromBloom('Late');
    expect(t!.basis).toBe('season_word');
    expect(t!.detail).toContain('a season, not a date');
    expect(t!.daysFromBloom).toBe(dayOfYear(10, 24) - REGIONAL_BLOOM_DOY);
  });

  it('orders the season words through the autumn', () => {
    const days = (w: string) => deriveDaysFromBloom(w)!.daysFromBloom;
    expect(days('Early')).toBeLessThan(days('Early-Mid'));
    expect(days('Early-Mid')).toBeLessThan(days('Mid'));
    expect(days('Mid')).toBeLessThan(days('Mid-Late'));
    expect(days('Mid-Late')).toBeLessThan(days('Late'));
  });

  it('gives nothing for text it cannot read', () => {
    expect(deriveDaysFromBloom('when it looks right')).toBeNull();
    expect(deriveDaysFromBloom('')).toBeNull();
    expect(deriveDaysFromBloom(null)).toBeNull();
  });

  it('produces a plausible interval for every real library entry it reads', () => {
    const entries = [
      'early-mid Oct (WSU Mt Vernon bloom 5/16, harvest 10/9)',
      'late Aug-early Sep (WSU Mt Vernon bloom 4/19, harvest 8/31) - the earliest harvest of this set',
      'mid-late Oct (WSU Mt Vernon bloom 5/22, harvest 10/18 - the latest of this set)',
      'Late September at WSU Mount Vernon (9/29 mean, 2002-2017); late October in England',
      'Early to early-mid season; August into early September in the PNW',
      'Late',
      'early Oct',
    ];
    for (const entry of entries) {
      const t = deriveDaysFromBloom(entry);
      expect(t, entry).not.toBeNull();
      // An apple runs roughly 100-200 days from bloom to picking. Anything
      // outside that is a misparse, not a cultivar.
      expect(t!.daysFromBloom, entry).toBeGreaterThan(90);
      expect(t!.daysFromBloom, entry).toBeLessThan(210);
    }
  });
});

describe('harvestWindowFor', () => {
  const bloom = new Date(Date.UTC(2026, 4, 12)); // 12 May 2026

  it('centres on bloom plus the interval', () => {
    const w = harvestWindowFor(bloom, 141, 'cider');
    expect(ymd(w.centre)).toBe('2026-09-30');
  });

  it('opens five days early and closes thirteen days late for cider', () => {
    const w = harvestWindowFor(bloom, 141, 'cider');
    expect(ymd(w.start)).toBe('2026-09-25');
    expect(ymd(w.end)).toBe('2026-10-13');
  });

  it('closes much sooner for fresh fruit', () => {
    const w = harvestWindowFor(bloom, 141, 'fresh');
    expect(ymd(w.start)).toBe('2026-09-25');
    expect(ymd(w.end)).toBe('2026-10-05');
  });

  it('keeps the window in order', () => {
    for (const purpose of ['cider', 'fresh'] as const) {
      const w = harvestWindowFor(bloom, 141, purpose);
      expect(w.start.getTime()).toBeLessThan(w.centre.getTime());
      expect(w.centre.getTime()).toBeLessThan(w.end.getTime());
    }
  });

  it('crosses a month boundary without drifting', () => {
    const w = harvestWindowFor(new Date(Date.UTC(2026, 3, 19)), 134, 'cider');
    expect(ymd(w.centre)).toBe('2026-08-31');
    expect(ymd(w.end)).toBe('2026-09-13');
  });

  it('does not mutate the bloom date it was given', () => {
    const original = new Date(Date.UTC(2026, 4, 12));
    harvestWindowFor(original, 141, 'cider');
    expect(ymd(original)).toBe('2026-05-12');
  });
});
