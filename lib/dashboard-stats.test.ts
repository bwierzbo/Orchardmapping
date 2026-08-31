import { describe, it, expect } from 'vitest';
import { computeOrchardStats } from './dashboard-stats';
import type { ClientTree } from './types';

let seq = 0;
function makeTree(overrides: Partial<ClientTree> = {}): ClientTree {
  seq++;
  return {
    id: seq,
    tree_id: `test-R01-P${String(seq).padStart(3, '0')}`,
    orchard_id: 'test',
    name: null,
    variety: null,
    status: 'healthy',
    planted_date: null,
    block_id: null,
    row_id: '1',
    position: seq,
    age: null,
    height: null,
    lat: null,
    lng: null,
    last_pruned: null,
    last_harvest: null,
    yield_estimate: null,
    notes: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

const NOW = new Date(2026, 7, 31); // 2026-08-31 local

describe('computeOrchardStats: empty input', () => {
  const stats = computeOrchardStats([], NOW);

  it('produces zeroed aggregates with no NaN', () => {
    expect(stats.total).toBe(0);
    expect(stats.statusCounts).toEqual({ healthy: 0, stressed: 0, dead: 0, unknown: 0 });
    expect(stats.statusPct).toEqual({ healthy: 0, stressed: 0, dead: 0, unknown: 0 });
    expect(stats.heightStats).toBeNull();
    expect(stats.yieldStats.topVariety).toBeNull();
    expect(stats.yieldStats.avgKg).toBe(0);
    expect(stats.varieties).toEqual([]);
    expect(stats.rows).toEqual([]);
    expect(stats.notes).toEqual([]);
  });
});

describe('status', () => {
  it('counts and percentages', () => {
    const stats = computeOrchardStats(
      [
        makeTree({ status: 'healthy' }),
        makeTree({ status: 'healthy' }),
        makeTree({ status: 'stressed' }),
        makeTree({ status: 'dead' }),
      ],
      NOW
    );
    expect(stats.statusCounts.healthy).toBe(2);
    expect(stats.statusPct.healthy).toBe(50);
    expect(stats.statusPct.unknown).toBe(0);
  });
});

describe('varieties', () => {
  it('collapses null and empty into one Unrecorded bucket, sorted by total desc', () => {
    const stats = computeOrchardStats(
      [
        makeTree({ variety: 'Fuji' }),
        makeTree({ variety: 'Fuji' }),
        makeTree({ variety: '' }),
        makeTree({ variety: null }),
        makeTree({ variety: '  ' }),
        makeTree({ variety: 'Gala' }),
      ],
      NOW
    );
    expect(stats.varieties[0]).toMatchObject({ variety: null, total: 3 });
    expect(stats.varieties[1]).toMatchObject({ variety: 'Fuji', total: 2 });
    expect(stats.varieties[2]).toMatchObject({ variety: 'Gala', total: 1 });
  });
});

describe('rows', () => {
  it('orders numerically, computes maxPosition, counts unplaced', () => {
    const stats = computeOrchardStats(
      [
        makeTree({ row_id: '10', position: 1 }),
        makeTree({ row_id: '2', position: 5 }),
        makeTree({ row_id: '2', position: 2 }),
        makeTree({ row_id: null, position: 1 }),
        makeTree({ row_id: '3', position: null }),
      ],
      NOW
    );
    expect(stats.rows.map((r) => r.rowId)).toEqual(['2', '10']);
    expect(stats.rows[0].maxPosition).toBe(5);
    expect(stats.rows[0].trees.map((t) => t.position)).toEqual([2, 5]);
    expect(stats.unplacedCount).toBe(2);
  });

  it('normalizes zero-padded rows into one row', () => {
    const stats = computeOrchardStats(
      [makeTree({ row_id: '01', position: 1 }), makeTree({ row_id: '1', position: 2 })],
      NOW
    );
    expect(stats.rows).toHaveLength(1);
    expect(stats.rows[0].rowId).toBe('1');
  });
});

describe('age histogram', () => {
  it('buckets boundary values correctly', () => {
    const ages = [0, 2, 3, 5, 6, 10, 11, 20, 21];
    const stats = computeOrchardStats(
      [...ages.map((age) => makeTree({ age })), makeTree({ age: null }), makeTree({ age: -1 })],
      NOW
    );
    const byLabel = Object.fromEntries(stats.ageHistogram.map((b) => [b.label, b.count]));
    expect(byLabel).toEqual({ '0–2': 2, '3–5': 2, '6–10': 2, '11–20': 2, '21+': 1 });
    expect(stats.ageUnknown).toBe(2);
  });
});

describe('care recency', () => {
  it('buckets against 6/12-month cutoffs with YMD comparison', () => {
    const stats = computeOrchardStats(
      [
        makeTree({ last_pruned: '2026-08-01' }), // < 6mo
        makeTree({ last_pruned: '2026-03-01' }), // < 6mo (cutoff 2026-02-28/29)
        makeTree({ last_pruned: '2026-01-15' }), // 6-12mo
        makeTree({ last_pruned: '2025-08-31' }), // 6-12mo (exactly 12mo cutoff)
        makeTree({ last_pruned: '2025-08-30' }), // > 12mo (one day past)
        makeTree({ last_pruned: null }), // never
      ],
      NOW
    );
    expect(stats.careRecency.pruned).toEqual({
      under6mo: 2,
      sixTo12mo: 2,
      over12mo: 1,
      never: 1,
    });
  });
});

describe('yield', () => {
  it('averages over trees with data; top variety ties break alphabetically', () => {
    const stats = computeOrchardStats(
      [
        makeTree({ variety: 'Gala', yield_estimate: 10 }),
        makeTree({ variety: 'Fuji', yield_estimate: 10 }),
        makeTree({ variety: 'Fuji' }),
        makeTree({}),
      ],
      NOW
    );
    expect(stats.yieldStats.totalKg).toBe(20);
    expect(stats.yieldStats.treesWithData).toBe(2);
    expect(stats.yieldStats.avgKg).toBe(10);
    expect(stats.yieldStats.topVariety).toEqual({ variety: 'Fuji', totalKg: 10 });
  });
});

describe('planted by year', () => {
  it('sorts ascending and counts malformed as unknown', () => {
    const stats = computeOrchardStats(
      [
        makeTree({ planted_date: '2021-04-01' }),
        makeTree({ planted_date: '2019-04-01' }),
        makeTree({ planted_date: '2021-05-01' }),
        makeTree({ planted_date: null }),
      ],
      NOW
    );
    expect(stats.plantedByYear).toEqual([
      { year: 2019, count: 1 },
      { year: 2021, count: 2 },
    ]);
    expect(stats.plantedUnknown).toBe(1);
  });
});

describe('completeness', () => {
  it('coords require both lat and lng', () => {
    const stats = computeOrchardStats(
      [
        makeTree({ lat: 48.1, lng: -123.2 }),
        makeTree({ lat: 48.1, lng: null }),
        makeTree({ lat: null, lng: -123.2 }),
      ],
      NOW
    );
    const coords = stats.completeness.find((c) => c.field === 'coords');
    expect(coords?.present).toBe(1);
  });
});

describe('notes', () => {
  it('lists only non-empty trimmed notes in row/position order', () => {
    const stats = computeOrchardStats(
      [
        makeTree({ row_id: '2', position: 1, notes: 'b' }),
        makeTree({ row_id: '1', position: 2, notes: '  ' }),
        makeTree({ row_id: '1', position: 1, notes: ' a ' }),
      ],
      NOW
    );
    expect(stats.notes.map((n) => n.notes)).toEqual(['a', 'b']);
  });
});
