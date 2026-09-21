import { describe, it, expect } from 'vitest';
import { treesInRing, applyLasso, type Ring } from './lasso';
import type { ClientTree } from './types';

function tree(id: string, lng: number | null, lat: number | null): ClientTree {
  return {
    id: Number(id.replace(/\D/g, '')) || 1,
    tree_id: id,
    orchard_id: 'o',
    status: 'healthy',
    lat,
    lng,
  } as ClientTree;
}

// A square around the origin of the orchard block
const SQUARE: Ring = [
  [-123.27, 48.11],
  [-123.26, 48.11],
  [-123.26, 48.12],
  [-123.27, 48.12],
];

describe('treesInRing', () => {
  it('includes trees inside and excludes trees outside', () => {
    const inside = tree('t1', -123.265, 48.115);
    const outside = tree('t2', -123.255, 48.115);
    const hits = treesInRing([inside, outside], SQUARE);
    expect(hits.map((t) => t.tree_id)).toEqual(['t1']);
  });

  it('skips trees with no coordinates rather than guessing', () => {
    const unplaced = tree('t3', null, null);
    expect(treesInRing([unplaced], SQUARE)).toEqual([]);
  });

  it('returns nothing for a trace too short to enclose anything', () => {
    const t = tree('t1', -123.265, 48.115);
    expect(treesInRing([t], [[-123.27, 48.11]])).toEqual([]);
    expect(treesInRing([t], [[-123.27, 48.11], [-123.26, 48.11]])).toEqual([]);
  });

  it('handles a concave trace: a tree in the notch is out', () => {
    // A "C" shape open to the east; the notch centre is outside the ring.
    const c: Ring = [
      [0, 0], [3, 0], [3, 1], [1, 1], [1, 2], [3, 2], [3, 3], [0, 3],
    ];
    const inNotch = tree('t9', 2, 1.5);
    const inArm = tree('t8', 0.5, 1.5);
    const hits = treesInRing([inNotch, inArm], c);
    expect(hits.map((t) => t.tree_id)).toEqual(['t8']);
  });
});

describe('applyLasso', () => {
  const a = tree('a', 0, 0);
  const b = tree('b', 0, 0);

  it('replace drops whatever was selected before', () => {
    expect([...applyLasso(new Set(['z']), [a], 'replace')]).toEqual(['a']);
  });

  it('add keeps the old selection and never double-counts', () => {
    expect([...applyLasso(new Set(['a']), [a, b], 'add')].sort()).toEqual(['a', 'b']);
  });

  it('subtract removes only what was circled', () => {
    expect([...applyLasso(new Set(['a', 'b']), [b], 'subtract')]).toEqual(['a']);
  });

  it('does not mutate the set it was given', () => {
    const before = new Set(['a']);
    applyLasso(before, [b], 'add');
    expect([...before]).toEqual(['a']);
  });
});
