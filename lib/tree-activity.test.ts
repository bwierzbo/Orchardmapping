import { describe, it, expect } from 'vitest';
import {
  describeSeasonTotal,
  latestActivity,
  latestCropLoad,
  latestInspection,
  seasonDisplayUnit,
  type ActivityEvent,
} from './tree-activity';
import { harvestSeason, type TreePick } from './tree-harvest-season';
import { toPounds } from './harvest-units';

/** A history row as GET /api/trees/[id]/events returns it. */
function ev(
  id: number,
  event_type: string,
  event_date: string | null,
  extra: Partial<ActivityEvent> = {}
): ActivityEvent {
  return {
    id,
    event_type,
    event_date,
    created_at: event_date ? `${event_date}T16:00:00.000Z` : null,
    changes: null,
    ...extra,
  };
}

/** A pick as insertTreeHarvest would have stored it. */
function pick(id: number, harvest_date: string, quantity: number, unit: 'bushel' | 'lb' | 'kg'): TreePick {
  const weight = toPounds(quantity, unit, 'apple');
  if (weight === null) throw new Error(`bad fixture ${quantity} ${unit}`);
  return { id, harvest_date, quantity, unit, weight_lbs: weight };
}

describe('latestActivity', () => {
  it('is null for a tree with no history', () => {
    expect(latestActivity([])).toBeNull();
  });

  it('skips record edits, so a typo fixed today does not hide yesterday’s pick', () => {
    const events = [
      ev(5, 'updated', '2026-10-17'),
      ev(4, 'moved', '2026-10-17'),
      ev(3, 'harvest', '2026-10-16'),
      ev(1, 'created', '2026-03-01'),
    ];
    const got = latestActivity(events);
    console.log('latest activity:', got);
    expect(got?.id).toBe(3);
  });

  it('is null when the only history is the record being created and edited', () => {
    expect(latestActivity([ev(2, 'updated', '2026-05-01'), ev(1, 'created', '2026-03-01')])).toBeNull();
  });

  it('orders by the day it happened, not the order the rows came back in', () => {
    // A pick back-dated to the 10th is entered after the spray on the 12th.
    const events = [ev(9, 'harvest', '2026-10-10'), ev(8, 'spray', '2026-10-12')];
    expect(latestActivity(events)?.event_type).toBe('spray');
  });

  it('breaks a same-day tie by when the entry was written, then by id', () => {
    const sameDay = [
      ev(20, 'harvest', '2026-10-17', { created_at: '2026-10-17T15:00:00.000Z' }),
      ev(21, 'harvest_complete', '2026-10-17', { created_at: '2026-10-17T15:00:05.000Z' }),
    ];
    expect(latestActivity(sameDay)?.event_type).toBe('harvest_complete');
    const sameInstant = [
      ev(30, 'bloom', '2026-05-01', { created_at: '2026-05-01T09:00:00.000Z' }),
      ev(31, 'fruit_check', '2026-05-01', { created_at: '2026-05-01T09:00:00.000Z' }),
    ];
    expect(latestActivity(sameInstant)?.id).toBe(31);
  });

  it('ignores an entry that was deleted', () => {
    const events = [
      ev(7, 'harvest', '2026-10-17', { undone_at: '2026-10-17T18:00:00.000Z' }),
      ev(6, 'pruning', '2026-02-20'),
    ];
    expect(latestActivity(events)?.event_type).toBe('pruning');
  });
});

describe('latestInspection', () => {
  it('counts looking at the tree, not work done to it', () => {
    const events = [
      ev(4, 'spray', '2026-07-01'),
      ev(3, 'note', '2026-06-20'),
      ev(2, 'fruit_check', '2026-06-15'),
      ev(1, 'observation', '2026-05-01'),
    ];
    const got = latestInspection(events);
    console.log('latest inspection:', got);
    expect(got?.id).toBe(2);
  });

  it('is null for a tree nobody has inspected', () => {
    expect(latestInspection([ev(1, 'pruning', '2026-02-20')])).toBeNull();
  });
});

describe('latestCropLoad', () => {
  it('reads the load from the newest fruit check, with its date', () => {
    const events = [
      ev(3, 'fruit_check', '2026-08-01', { changes: { load: 4, brix: 11.2 } }),
      ev(2, 'fruit_check', '2026-07-01', { changes: { load: 2 } }),
    ];
    expect(latestCropLoad(events)).toEqual({ load: 4, date: '2026-08-01' });
  });

  it('passes over a check that only took measurements', () => {
    const events = [
      ev(3, 'fruit_check', '2026-09-01', { changes: { brix: 13.5 } }),
      ev(2, 'fruit_check', '2026-07-01', { changes: { load: 3 } }),
    ];
    expect(latestCropLoad(events)).toEqual({ load: 3, date: '2026-07-01' });
  });

  it('ignores a deleted check and anything out of the 1-5 scale', () => {
    const events = [
      ev(4, 'fruit_check', '2026-09-10', { changes: { load: 5 }, undone_at: '2026-09-10T20:00:00Z' }),
      ev(3, 'fruit_check', '2026-09-01', { changes: { load: 0 } }),
      ev(2, 'fruit_check', '2026-08-01', { changes: { load: '4' } }),
      ev(1, 'observation', '2026-08-01', { changes: { load: 4 } }),
    ];
    expect(latestCropLoad(events)).toBeNull();
  });

  it('is null with no fruit checks at all', () => {
    expect(latestCropLoad([ev(1, 'harvest', '2026-10-01')])).toBeNull();
  });
});

describe('seasonDisplayUnit', () => {
  it('uses the unit most picks were entered in', () => {
    expect(seasonDisplayUnit([{ unit: 'bushel' }, { unit: 'bushel' }, { unit: 'kg' }])).toBe('bushel');
  });

  it('falls back to pounds on a tie or with no known unit', () => {
    expect(seasonDisplayUnit([{ unit: 'kg' }, { unit: 'bushel' }])).toBe('lb');
    expect(seasonDisplayUnit([{ unit: null }])).toBe('lb');
    expect(seasonDisplayUnit([])).toBe('lb');
  });
});

describe('describeSeasonTotal', () => {
  it('is null for a tree nothing has come off this season', () => {
    expect(describeSeasonTotal(harvestSeason([], 2026, 'apple', null))).toBeNull();
  });

  it('states one pick in pounds', () => {
    const season = harvestSeason([pick(1, '2026-10-17', 80, 'lb')], 2026, 'apple', '2026-10-17');
    expect(describeSeasonTotal(season)).toBe('80 lb picked (1 pick)');
  });

  it('states the whole season in the unit most picks used', () => {
    // 2 bushels (84 lb) + 1 bushel (42 lb) + 20 lb = 146 lb = 3.5 bushels.
    const season = harvestSeason(
      [pick(1, '2026-10-03', 2, 'bushel'), pick(2, '2026-10-10', 1, 'bushel'), pick(3, '2026-10-12', 20, 'lb')],
      2026,
      'apple',
      null
    );
    const said = describeSeasonTotal(season);
    console.log('season total:', said, season.total_lbs, season.total_bushels);
    expect(said).toBe('3.5 bushels picked (3 picks)');
  });

  it('leaves last year’s picks out', () => {
    const season = harvestSeason(
      [pick(1, '2025-10-03', 30, 'kg'), pick(2, '2026-10-10', 9, 'kg')],
      2026,
      'apple',
      null
    );
    expect(describeSeasonTotal(season)).toBe('9 kg picked (1 pick)');
  });
});
