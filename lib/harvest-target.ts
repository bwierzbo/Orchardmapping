/**
 * When a variety wants picking, and how wide the window is.
 *
 * Harvest date is anchored to full bloom, not to the calendar: the interval
 * from bloom to picking holds steady for a cultivar while the calendar date
 * moves a fortnight with the spring. Chill has nothing to do with it --
 * chill governs whether the tree wakes up properly, which is a different
 * question answered in a different season.
 *
 * Everything here is a starting value. The point is to be useful before a
 * single local harvest has been recorded, and to be replaced variety by
 * variety as they are. `basis` says which is which, and it is never hidden:
 * a number read off a season word deserves to look weaker than one measured
 * at a research station.
 */
import { estimatePickDate } from './harvest-window';

export const HARVEST_PURPOSES = ['cider', 'fresh'] as const;
export type HarvestPurpose = (typeof HARVEST_PURPOSES)[number];

/**
 * How far either side of the predicted date the window runs.
 *
 * Not symmetric, and the asymmetry is the point. Picking a cider apple
 * early is the real failure -- thin sugar, hard tannin, a cider that never
 * comes right -- while late is usable and fruit gathered off the ground
 * still presses. Fresh fruit is the other way about: pick it late and it
 * goes soft in store, so the window closes almost as soon as it opens.
 */
export const PURPOSE_WINDOW: Record<HarvestPurpose, { leadDays: number; tailDays: number }> = {
  fresh: { leadDays: 5, tailDays: 5 },
  cider: { leadDays: 5, tailDays: 13 },
};

/** Maturity targets that say "now", once fruit is being sampled. */
export const PURPOSE_TARGETS: Record<
  HarvestPurpose,
  { starchIndex: number; note: string }
> = {
  // Starch on the 1-8 scale the inspection form uses.
  fresh: { starchIndex: 3, note: 'Firm, stores well; picked before full ripeness.' },
  cider: { starchIndex: 7, note: 'Starch mostly converted; sugar and tannin developed.' },
};

/**
 * Mean full bloom at WSU Mount Vernon across the eight cider varieties whose
 * bloom and harvest dates the variety library records: day 128, 8 May.
 *
 * Used only to derive an interval for a variety whose library entry gives a
 * harvest date but no bloom date. It is an average of a different site's
 * averages, so anything resting on it is marked as derived, never measured.
 */
export const REGIONAL_BLOOM_DOY = 128;

/**
 * Where a number came from, weakest last. Shown in the UI so a seeded guess
 * never passes for an observation.
 */
export const TARGET_BASES = [
  'observed', // this orchard's own bloom-to-harvest records
  'wsu_paired', // bloom AND harvest both recorded at WSU Mount Vernon
  'text_date', // a harvest date in the library text, bloom assumed regional
  'season_word', // only "Early"/"Mid"/"Late" -- a season, not a date
] as const;
export type TargetBasis = (typeof TARGET_BASES)[number];

export interface DerivedTarget {
  daysFromBloom: number;
  basis: TargetBasis;
  /** What the derivation leaned on, for showing beside the number. */
  detail: string;
}

/** Days before the first of each month, non-leap. */
const DAYS_BEFORE_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export function dayOfYear(month: number, day: number): number {
  return DAYS_BEFORE_MONTH[month - 1] + day;
}

/**
 * Pull a "bloom 5/12, harvest 9/30" pair out of a library entry. Both dates
 * from one station in one set of seasons, which is the best interval
 * available short of measuring it here.
 */
export function parseBloomHarvestPair(
  text: string | null | undefined
): { bloomDoy: number; harvestDoy: number } | null {
  if (!text) return null;
  const bloom = /bloom\s+(\d{1,2})\/(\d{1,2})/i.exec(text);
  const harvest = /harvest\s+(\d{1,2})\/(\d{1,2})/i.exec(text);
  if (!bloom || !harvest) return null;
  const [, bm, bd] = bloom;
  const [, hm, hd] = harvest;
  const bloomMonth = Number(bm);
  const harvestMonth = Number(hm);
  if (bloomMonth < 1 || bloomMonth > 12 || harvestMonth < 1 || harvestMonth > 12) return null;
  const bloomDoy = dayOfYear(bloomMonth, Number(bd));
  const harvestDoy = dayOfYear(harvestMonth, Number(hd));
  // Bloom precedes harvest within one northern season; anything else is a
  // sentence this pattern has misread.
  if (harvestDoy <= bloomDoy) return null;
  return { bloomDoy, harvestDoy };
}

/**
 * Typical picking day for a season word in maritime western Washington.
 *
 * A judgement, not a record: "Late" says late for its species, and turning
 * it into a date is the weakest thing this module does. Kept because a
 * variety with no number at all cannot be planned around, and marked
 * `season_word` so it can be shown for what it is.
 */
const SEASON_WORD_HARVEST_DOY: Record<string, number> = {
  early: dayOfYear(9, 5),
  'early-mid': dayOfYear(9, 15),
  mid: dayOfYear(10, 3),
  'mid-late': dayOfYear(10, 14),
  late: dayOfYear(10, 24),
  'very late': dayOfYear(10, 30),
};

/**
 * Read an interval from bloom out of a variety library entry, strongest
 * source first. Returns null when the text says nothing usable.
 */
export function deriveDaysFromBloom(text: string | null | undefined): DerivedTarget | null {
  const value = text?.trim();
  if (!value) return null;

  const pair = parseBloomHarvestPair(value);
  if (pair) {
    return {
      daysFromBloom: pair.harvestDoy - pair.bloomDoy,
      basis: 'wsu_paired',
      detail: 'Bloom and harvest both recorded at WSU Mount Vernon.',
    };
  }

  const estimate = estimatePickDate(value);
  if (estimate) {
    return {
      daysFromBloom: estimate.dayOfYear - REGIONAL_BLOOM_DOY,
      basis: 'text_date',
      detail: `Harvest ${estimate.label.replace('≈ ', '')} from the library; bloom assumed regional (8 May).`,
    };
  }

  const word = value.toLowerCase().replace(/\s+/g, ' ').trim();
  const doy = SEASON_WORD_HARVEST_DOY[word];
  if (doy !== undefined) {
    return {
      daysFromBloom: doy - REGIONAL_BLOOM_DOY,
      basis: 'season_word',
      detail: `Only "${value}" recorded — a season, not a date. Replace it with an observed harvest.`,
    };
  }

  return null;
}

export interface HarvestWindow {
  start: Date;
  centre: Date;
  end: Date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * The window to pick in: bloom plus the interval, opened and closed by the
 * purpose's lead and tail.
 */
export function harvestWindowFor(
  bloomDate: Date,
  daysFromBloom: number,
  purpose: HarvestPurpose
): HarvestWindow {
  const { leadDays, tailDays } = PURPOSE_WINDOW[purpose];
  const centre = addDays(bloomDate, daysFromBloom);
  return {
    start: addDays(centre, -leadDays),
    centre,
    end: addDays(centre, tailDays),
  };
}
