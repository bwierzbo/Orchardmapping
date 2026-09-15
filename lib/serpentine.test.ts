import { describe, it, expect } from 'vitest';
import { serpentineOrder } from './serpentine';
import type { ClientTree } from './types';

function tree(row: string, position: number): ClientTree {
  return {
    id: Number(`${row}${position}`),
    tree_id: `t-R${row}-P${position}`,
    orchard_id: 'o',
    status: 'unknown',
    row_id: row,
    position: String(position),
  } as ClientTree;
}

describe('serpentineOrder', () => {
  it('walks up the first row and down the second', () => {
    const trees = [tree('1', 1), tree('1', 2), tree('2', 1), tree('2', 2)];
    const order = serpentineOrder(trees).map((t) => t.tree_id);
    expect(order).toEqual(['t-R1-P1', 't-R1-P2', 't-R2-P2', 't-R2-P1']);
  });

  it('sorts rows numerically and shuffled input deterministically', () => {
    const trees = [tree('10', 2), tree('2', 1), tree('1', 2), tree('10', 1), tree('1', 1), tree('2', 2)];
    const order = serpentineOrder(trees).map((t) => t.tree_id);
    expect(order).toEqual([
      't-R1-P1', 't-R1-P2',
      't-R2-P2', 't-R2-P1',
      't-R10-P1', 't-R10-P2',
    ]);
  });

  it('normalizes padded row ids into one row', () => {
    const trees = [tree('01', 2), tree('1', 1)];
    const order = serpentineOrder(trees).map((t) => t.tree_id);
    expect(order).toEqual(['t-R1-P1', 't-R01-P2']);
  });

  it('excludes trees without a row/position address', () => {
    const unaddressed = { ...tree('1', 1), row_id: null, position: null } as ClientTree;
    expect(serpentineOrder([unaddressed, tree('1', 1)])).toHaveLength(1);
  });
});

describe('varietySamplePath', () => {
  it('keeps the first N of each contiguous variety run', async () => {
    const { varietySamplePath } = await import('./serpentine');
    const mk = (row: string, position: number, variety: string) =>
      ({ ...tree(row, position), variety }) as ClientTree;
    const trees = [
      mk('1', 1, 'Cox'), mk('1', 2, 'Cox'), mk('1', 3, 'Cox'),
      mk('1', 4, 'Crab'), mk('1', 5, 'Crab'),
      mk('2', 1, 'Spy'), mk('2', 2, 'Spy'), mk('2', 3, 'Spy'),
    ];
    const order = varietySamplePath(trees, 2).map((t) => `${t.tree_id}`);
    // Row 1 forward: Cox x2, Crab x2; row 2 reversed: Spy run starts at P3
    expect(order).toEqual([
      't-R1-P1', 't-R1-P2',
      't-R1-P4', 't-R1-P5',
      't-R2-P3', 't-R2-P2',
    ]);
  });
});

describe('walkPathFrom', () => {
  const grid = [
    tree('1', 1), tree('1', 2), tree('1', 3),
    tree('2', 1), tree('2', 2), tree('2', 3),
    tree('3', 1), tree('3', 2), tree('3', 3),
  ];
  const ids = (list: ClientTree[]) => list.map((t) => t.tree_id);

  it('starts at the chosen tree and serpentines in the chosen directions', async () => {
    const { walkPathFrom } = await import('./serpentine');
    const { path, turnaround } = walkPathFrom(grid, 't-R2-P2', { along: 1, rows: 1 });
    expect(ids(path.slice(0, turnaround))).toEqual([
      't-R2-P2', 't-R2-P3',
      't-R3-P3', 't-R3-P2', 't-R3-P1',
    ]);
    // Second leg: back at the start, the rest of row 2 the other way, then row 1
    expect(ids(path.slice(turnaround))).toEqual(['t-R2-P1', 't-R1-P1', 't-R1-P2', 't-R1-P3']);
    expect(path).toHaveLength(grid.length);
  });

  it('walks down positions and down rows when asked', async () => {
    const { walkPathFrom } = await import('./serpentine');
    const { path, turnaround } = walkPathFrom(grid, 't-R3-P3', { along: -1, rows: -1 });
    expect(ids(path)).toEqual([
      't-R3-P3', 't-R3-P2', 't-R3-P1',
      't-R2-P1', 't-R2-P2', 't-R2-P3',
      't-R1-P3', 't-R1-P2', 't-R1-P1',
    ]);
    expect(turnaround).toBe(path.length);
  });

  it('handles a start at the end of its row', async () => {
    const { walkPathFrom } = await import('./serpentine');
    const { path, turnaround } = walkPathFrom(grid, 't-R1-P3', { along: 1, rows: 1 });
    expect(ids(path.slice(0, turnaround))).toEqual([
      't-R1-P3',
      't-R2-P3', 't-R2-P2', 't-R2-P1',
      't-R3-P1', 't-R3-P2', 't-R3-P3',
    ]);
    expect(ids(path.slice(turnaround))).toEqual(['t-R1-P2', 't-R1-P1']);
  });

  it('falls back to the default serpentine when the start is unknown', async () => {
    const { walkPathFrom, serpentineOrder } = await import('./serpentine');
    const { path, turnaround } = walkPathFrom(grid, 'nope', { along: -1, rows: -1 });
    expect(ids(path)).toEqual(ids(serpentineOrder(grid)));
    expect(turnaround).toBe(path.length);
    expect(ids(walkPathFrom(grid, null, { along: 1, rows: 1 }).path)).toEqual(ids(serpentineOrder(grid)));
  });

  it('describes the surroundings of a start tree and picks the longer way as default', async () => {
    const { walkContext, defaultDirection } = await import('./serpentine');
    const ctx = walkContext(grid, 't-R3-P3');
    expect(ctx).toMatchObject({
      row: '3', position: '3',
      aheadUp: 0, aheadDown: 2, nextPosUp: null, nextPosDown: '2',
      rowsUp: 0, rowsDown: 2, nextRowUp: null, nextRowDown: '2',
    });
    expect(defaultDirection(ctx)).toEqual({ along: -1, rows: -1 });
    expect(defaultDirection(walkContext(grid, 't-R2-P2'))).toEqual({ along: 1, rows: 1 });
    expect(walkContext(grid, 'nope')).toBeNull();
  });
});
