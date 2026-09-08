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
    position,
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
