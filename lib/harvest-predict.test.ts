import { describe, it, expect } from 'vitest';
import {
  predictHarvest,
  certaintyOf,
  dateFromDayOfYear,
  ASSUMED_BLOOM_PENALTY_DAYS,
  LATE_SEASON_CUTOFF,
} from './harvest-predict';
import { REGIONAL_BLOOM_DOY } from './harvest-target';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const base = {
  daysFromBloom: 141, // Kingston Black, measured at WSU Mount Vernon
  basis: 'wsu_paired' as const,
  purpose: 'cider' as const,
  year: 2027,
};

describe('dateFromDayOfYear', () => {
  it('counts day 1 as the first of January', () => {
    expect(ymd(dateFromDayOfYear(2027, 1))).toBe('2027-01-01');
  });

  it('places the regional bloom on 8 May', () => {
    expect(ymd(dateFromDayOfYear(2027, REGIONAL_BLOOM_DOY))).toBe('2027-05-08');
  });
});

describe('predictHarvest', () => {
  it('uses a recorded bloom when there is one', () => {
    const p = predictHarvest({ ...base, bloom: new Date(Date.UTC(2027, 4, 12)) });
    expect(p.bloomSource).toBe('recorded');
    expect(ymd(p.bloom)).toBe('2027-05-12');
    expect(ymd(p.window.centre)).toBe('2027-09-30');
  });

  it('falls back to the regional bloom and says so', () => {
    const p = predictHarvest(base);
    expect(p.bloomSource).toBe('regional');
    expect(ymd(p.bloom)).toBe('2027-05-08');
    expect(p.note).toContain('none recorded');
  });

  it('widens the window when the bloom was assumed', () => {
    const recorded = predictHarvest({ ...base, bloom: new Date(Date.UTC(2027, 4, 8)) });
    const assumed = predictHarvest(base);
    expect(assumed.confidenceDays).toBe(recorded.confidenceDays + ASSUMED_BLOOM_PENALTY_DAYS);
  });

  it('is more certain the better the interval is known', () => {
    const bloom = new Date(Date.UTC(2027, 4, 12));
    const measured = predictHarvest({ ...base, bloom, basis: 'observed' });
    const station = predictHarvest({ ...base, bloom, basis: 'wsu_paired' });
    const text = predictHarvest({ ...base, bloom, basis: 'text_date' });
    const word = predictHarvest({ ...base, bloom, basis: 'season_word' });
    expect(measured.confidenceDays).toBeLessThan(station.confidenceDays);
    expect(station.confidenceDays).toBeLessThan(text.confidenceDays);
    expect(text.confidenceDays).toBeLessThan(word.confidenceDays);
  });

  it('says what it rests on', () => {
    const p = predictHarvest({ ...base, bloom: new Date(Date.UTC(2027, 4, 12)) });
    expect(p.note).toContain('WSU Mount Vernon');
    expect(p.note).toContain('bloom recorded here');
    expect(p.note).toContain('±7 days');
  });

  it('gives cider the long tail and fresh the short one', () => {
    const bloom = new Date(Date.UTC(2027, 4, 12));
    const cider = predictHarvest({ ...base, bloom, purpose: 'cider' });
    const fresh = predictHarvest({ ...base, bloom, purpose: 'fresh' });
    expect(ymd(cider.window.centre)).toBe(ymd(fresh.window.centre));
    expect(ymd(cider.window.start)).toBe(ymd(fresh.window.start));
    expect(cider.window.end.getTime()).toBeGreaterThan(fresh.window.end.getTime());
  });

  describe('late season risk', () => {
    it('is quiet for a variety that ripens well inside the season', () => {
      const p = predictHarvest({ ...base, bloom: new Date(Date.UTC(2027, 4, 12)) });
      expect(p.lateSeasonRisk).toBe(false);
    });

    it('fires when the window runs past the cutoff', () => {
      // A very late variety: bloom late May, 175 days, cider tail.
      const p = predictHarvest({
        ...base,
        daysFromBloom: 175,
        bloom: new Date(Date.UTC(2027, 4, 22)),
      });
      expect(p.lateSeasonRisk).toBe(true);
      expect(p.window.end.getTime()).toBeGreaterThan(
        Date.UTC(2027, LATE_SEASON_CUTOFF.month - 1, LATE_SEASON_CUTOFF.day)
      );
    });

    it('judges by the end of the window, not its centre', () => {
      // Centre sits before the cutoff; the cider tail carries the end past
      // it. The risk is about running out of season, so the end decides.
      const p = predictHarvest({
        ...base,
        daysFromBloom: 172,
        bloom: new Date(Date.UTC(2027, 4, 12)),
      });
      expect(ymd(p.window.centre)).toBe('2027-10-31');
      expect(p.window.centre.getTime()).toBeLessThan(
        Date.UTC(2027, LATE_SEASON_CUTOFF.month - 1, LATE_SEASON_CUTOFF.day)
      );
      expect(p.lateSeasonRisk).toBe(true);
    });

    it('fires less readily for fresh fruit, which comes off sooner', () => {
      // Centre 24 October. The cider tail carries the window to 6 November
      // and past the cutoff; the fresh one closes on 29 October, inside it.
      const bloom = new Date(Date.UTC(2027, 4, 12));
      const late = { ...base, daysFromBloom: 165, bloom };
      const cider = predictHarvest({ ...late, purpose: 'cider' });
      const fresh = predictHarvest({ ...late, purpose: 'fresh' });
      expect(ymd(cider.window.end)).toBe('2027-11-06');
      expect(ymd(fresh.window.end)).toBe('2027-10-29');
      expect(cider.lateSeasonRisk).toBe(true);
      expect(fresh.lateSeasonRisk).toBe(false);
    });
  });

  it('handles a leap year without drifting a day', () => {
    const p = predictHarvest({ ...base, year: 2028, bloom: new Date(Date.UTC(2028, 4, 12)) });
    expect(ymd(p.window.centre)).toBe('2028-09-30');
  });
});

describe('certaintyOf', () => {
  const bloom = new Date(Date.UTC(2027, 4, 12));

  it('calls a measured interval on a recorded bloom measured', () => {
    expect(certaintyOf(predictHarvest({ ...base, bloom, basis: 'observed' }))).toBe('measured');
    expect(certaintyOf(predictHarvest({ ...base, bloom, basis: 'wsu_paired' }))).toBe('measured');
  });

  it('demotes the same interval when the bloom was assumed', () => {
    // Nothing about the variety changed; the bloom did. The chart should
    // show that as less certain, not the same.
    expect(certaintyOf(predictHarvest({ ...base, basis: 'wsu_paired' }))).toBe('derived');
  });

  it('calls a season word with an assumed bloom a guess', () => {
    expect(certaintyOf(predictHarvest({ ...base, basis: 'season_word' }))).toBe('guessed');
  });
});
