import { describe, it, expect } from 'vitest';
import {
  asHarvestUnit,
  harvestSeason,
  hiddenByHarvest,
  isHarvestComplete,
  pickedOutIds,
  type TreePick,
} from './tree-harvest-season';
import { toPounds } from './harvest-units';

/** A pick as insertTreeHarvest would have stored it. */
function pick(
  id: number,
  harvest_date: string,
  quantity: number,
  unit: 'bushel' | 'lb' | 'kg',
  fruitType: string | null = 'apple',
): TreePick {
  const weight = toPounds(quantity, unit, fruitType);
  if (weight === null) throw new Error(`bad fixture ${quantity} ${unit}`);
  return { id, harvest_date, quantity, unit, weight_lbs: weight };
}

describe('harvestSeason', () => {
  it('is an empty season, not an error, for a tree never picked', () => {
    const s = harvestSeason([], 2026, 'apple', null);
    console.log('empty season:', s);
    expect(s.picks).toEqual([]);
    expect(s.total_lbs).toBe(0);
    expect(s.total_kg).toBe(0);
    expect(s.total_bushels).toBe(0);
    expect(s.complete).toBe(false);
  });

  it('adds several picks off one tree, in whatever units they were said', () => {
    // 2 bushels (84 lb) on the 3rd, 20 lb on the 10th, 9 kg on the 17th.
    const picks = [
      pick(1, '2026-10-03', 2, 'bushel'),
      pick(2, '2026-10-10', 20, 'lb'),
      pick(3, '2026-10-17', 9, 'kg'),
    ];
    const s = harvestSeason(picks, 2026, 'apple', null);
    console.log('three picks:', s);
    // 84 + 20 + 19.8 (9 kg stored to one decimal)
    expect(s.total_lbs).toBe(123.8);
    expect(s.total_kg).toBe(56.2);
    expect(s.total_bushels).toBe(2.9);
    expect(s.picks.map((p) => p.id)).toEqual([3, 2, 1]);
  });

  it('works bushels back with the bushel for THIS fruit', () => {
    // 100 lb of pears is two bushels; the same 100 lb of apples is 2.4.
    const pears = harvestSeason([pick(1, '2026-09-20', 100, 'lb', 'pear')], 2026, 'pear', null);
    const apples = harvestSeason([pick(1, '2026-09-20', 100, 'lb')], 2026, 'apple', null);
    console.log('pear vs apple bushels:', pears.total_bushels, apples.total_bushels);
    expect(pears.total_bushels).toBe(2);
    expect(pears.bushel_lb).toBe(50);
    expect(apples.total_bushels).toBe(2.4);
  });

  it('round-trips a season entered in bushels back to the same bushels', () => {
    // A grower who said 3 bushels and then 1.5 should read 4.5, not 4.4.
    const s = harvestSeason(
      [pick(1, '2026-10-01', 3, 'bushel'), pick(2, '2026-10-08', 1.5, 'bushel')],
      2026,
      'apple',
      null,
    );
    expect(s.total_lbs).toBe(189);
    expect(s.total_bushels).toBe(4.5);
  });

  it('keeps last year out of this year, at the year boundary itself', () => {
    const picks = [
      pick(1, '2025-12-31', 10, 'lb'),
      pick(2, '2026-01-01', 5, 'lb'),
      pick(3, '2026-12-31', 7, 'lb'),
      pick(4, '2027-01-01', 100, 'lb'),
    ];
    const s = harvestSeason(picks, 2026, 'apple', null);
    console.log('2026 picks:', s.picks.map((p) => p.harvest_date));
    expect(s.picks.map((p) => p.harvest_date)).toEqual(['2026-12-31', '2026-01-01']);
    expect(s.total_lbs).toBe(12);
  });

  it('reads each pick back as it was entered', () => {
    const s = harvestSeason(
      [pick(1, '2026-10-01', 3, 'bushel'), pick(2, '2026-10-02', 12, 'lb')],
      2026,
      'apple',
      null,
    );
    expect(s.picks.map((p) => p.detail)).toEqual(['12 lb', '3 bushels (126 lb)']);
  });

  it('shows the weight of a row that carries no entered figure', () => {
    const s = harvestSeason(
      [{ id: 1, harvest_date: '2026-10-01', quantity: null, unit: null, weight_lbs: 33.5 }],
      2026,
      'apple',
      null,
    );
    expect(s.picks[0].detail).toBe('33.5 lb');
    expect(s.total_lbs).toBe(33.5);
  });

  it('orders two picks on one day by when they were written', () => {
    const s = harvestSeason(
      [pick(7, '2026-10-01', 1, 'lb'), pick(9, '2026-10-01', 2, 'lb')],
      2026,
      'apple',
      null,
    );
    expect(s.picks.map((p) => p.id)).toEqual([9, 7]);
  });

  it('is complete only when it was marked complete this season', () => {
    expect(harvestSeason([], 2026, 'apple', '2026-10-12').complete).toBe(true);
    const lastYear = harvestSeason([], 2026, 'apple', '2025-10-12');
    expect(lastYear.complete).toBe(false);
    // The date is still reported, so the form can say when it last was.
    expect(lastYear.completed_on).toBe('2025-10-12');
  });
});

describe('isHarvestComplete', () => {
  it('opens again on its own in the new year', () => {
    expect(isHarvestComplete('2025-12-31', 2025)).toBe(true);
    expect(isHarvestComplete('2025-12-31', 2026)).toBe(false);
    expect(isHarvestComplete('2026-01-01', 2026)).toBe(true);
  });

  it('is not complete with no date, or with something that is not a date', () => {
    expect(isHarvestComplete(null, 2026)).toBe(false);
    expect(isHarvestComplete(undefined, 2026)).toBe(false);
    expect(isHarvestComplete('', 2026)).toBe(false);
    expect(isHarvestComplete('Oct 12', 2026)).toBe(false);
  });
});

describe('asHarvestUnit', () => {
  it('passes the three units and rejects anything else', () => {
    expect(asHarvestUnit('bushel')).toBe('bushel');
    expect(asHarvestUnit('lb')).toBe('lb');
    expect(asHarvestUnit('kg')).toBe('kg');
    expect(asHarvestUnit('lbs')).toBeNull();
    expect(asHarvestUnit(null)).toBeNull();
  });
});

describe('map harvest filter', () => {
  // Terry Anderson on 2026-10-17: #2 and #3 picked out, #1 still being picked,
  // #4 picked out last season (open again this year).
  const trees = [
    { tree_id: 'TA-001-0001', harvest_completed_on: null },
    { tree_id: 'TA-001-0002', harvest_completed_on: '2026-10-17' },
    { tree_id: 'TA-001-0003', harvest_completed_on: '2026-10-17' },
    { tree_id: 'TA-001-0004', harvest_completed_on: '2025-10-30' },
  ];

  it('counts only trees picked out this season', () => {
    const done = pickedOutIds(trees, 2026);
    console.log('picked out 2026:', [...done]);
    expect([...done].sort()).toEqual(['TA-001-0002', 'TA-001-0003']);
    expect(pickedOutIds(trees, 2027).size).toBe(0);
  });

  it('"To pick" hides the picked-out trees and keeps last season\'s', () => {
    const hidden = hiddenByHarvest(trees, pickedOutIds(trees, 2026), 'open');
    console.log('hidden by To pick:', hidden);
    expect(hidden.sort()).toEqual(['TA-001-0002', 'TA-001-0003']);
  });

  it('"Picked out" hides everything still to pick', () => {
    const hidden = hiddenByHarvest(trees, pickedOutIds(trees, 2026), 'complete');
    console.log('hidden by Picked out:', hidden);
    expect(hidden.sort()).toEqual(['TA-001-0001', 'TA-001-0004']);
  });

  it('"All" hides nothing', () => {
    expect(hiddenByHarvest(trees, pickedOutIds(trees, 2026), 'all')).toEqual([]);
  });
});
