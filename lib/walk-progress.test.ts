import { describe, it, expect } from 'vitest';
import {
  markTreeInspected,
  newerWalkProgress,
  nextUnassessed,
  normalizeWalkProgress,
  resumeRoute,
  type WalkProgress,
} from './walk-progress';
import type { ClientTree } from './types';

function tree(id: string): ClientTree {
  return { id: id.length, tree_id: id, orchard_id: 'o', status: 'unknown' } as ClientTree;
}

const saved: WalkProgress = {
  version: 1,
  orchardId: 'o',
  inspections: ['health'],
  detailedFruit: false,
  pathIds: ['a', 'b', 'c', 'd', 'e'],
  turnaround: 3,
  currentId: 'c',
  doneIds: ['a', 'b'],
  recorded: 2,
  startedAt: '2026-09-14T10:00:00.000Z',
  updatedAt: '2026-09-14T10:30:00.000Z',
};

describe('normalizeWalkProgress', () => {
  it('accepts a well-formed walk and fills in defaults', () => {
    expect(normalizeWalkProgress(saved)).toEqual(saved);
    const sparse = normalizeWalkProgress({
      version: 1,
      orchardId: 'o',
      inspections: ['bloom', 'bogus'],
      pathIds: ['a'],
    });
    expect(sparse).toMatchObject({
      inspections: ['bloom'],
      detailedFruit: false,
      turnaround: 1,
      currentId: null,
      doneIds: [],
      recorded: 0,
    });
  });

  it('rejects junk', () => {
    expect(normalizeWalkProgress(null)).toBeNull();
    expect(normalizeWalkProgress({ version: 2, orchardId: 'o', pathIds: ['a'], inspections: ['health'] })).toBeNull();
    expect(normalizeWalkProgress({ version: 1, orchardId: 'o', pathIds: [], inspections: ['health'] })).toBeNull();
    expect(normalizeWalkProgress({ version: 1, orchardId: 'o', pathIds: ['a'], inspections: [] })).toBeNull();
    expect(normalizeWalkProgress({ version: 1, orchardId: 'o', pathIds: [1], inspections: ['health'] })).toBeNull();
  });

  it('clamps a turnaround past the path end', () => {
    expect(normalizeWalkProgress({ ...saved, turnaround: 99 })?.turnaround).toBe(5);
  });
});

describe('newerWalkProgress', () => {
  it('prefers the more recently updated copy', () => {
    const later = { ...saved, updatedAt: '2026-09-14T11:00:00.000Z' };
    expect(newerWalkProgress(saved, later)).toBe(later);
    expect(newerWalkProgress(later, saved)).toBe(later);
    expect(newerWalkProgress(null, saved)).toBe(saved);
    expect(newerWalkProgress(saved, null)).toBe(saved);
  });
});

describe('resumeRoute', () => {
  it('puts the walker back on the saved tree with the assessed set', () => {
    const trees = ['a', 'b', 'c', 'd', 'e'].map(tree);
    const r = resumeRoute(saved, trees)!;
    expect(r.path.map((t) => t.tree_id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(r.index).toBe(2);
    expect(r.turnaround).toBe(3);
    expect([...r.done]).toEqual(['a', 'b']);
  });

  it('drops deleted trees, shifts the turnaround, and lands on the first unassessed tree', () => {
    const trees = ['a', 'b', 'd', 'e'].map(tree); // c (the current tree) is gone
    const r = resumeRoute(saved, trees)!;
    expect(r.path.map((t) => t.tree_id)).toEqual(['a', 'b', 'd', 'e']);
    expect(r.turnaround).toBe(2);
    expect(r.index).toBe(2); // d
  });

  it('returns null when none of the route survives', () => {
    expect(resumeRoute(saved, [tree('zzz')])).toBeNull();
  });

  it('skips past a saved tree that was assessed from the panel meanwhile', () => {
    const trees = ['a', 'b', 'c', 'd', 'e'].map(tree);
    const r = resumeRoute({ ...saved, doneIds: ['a', 'b', 'c', 'd'] }, trees)!;
    expect(r.index).toBe(4); // e
    const all = resumeRoute({ ...saved, doneIds: ['a', 'b', 'c', 'd', 'e'] }, trees)!;
    expect(all.index).toBe(4); // nothing left: land on the end so Finish shows
  });
});

describe('markTreeInspected', () => {
  it('adds the tree, bumps the count, and moves the walker off it', () => {
    const updated = markTreeInspected(saved, 'c', 2)!;
    expect(updated.doneIds).toEqual(['a', 'b', 'c']);
    expect(updated.recorded).toBe(4);
    expect(updated.currentId).toBe('d');
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(saved.updatedAt));
  });

  it('keeps the walker where it is when another tree is inspected', () => {
    expect(markTreeInspected(saved, 'e', 1)!.currentId).toBe('c');
  });

  it('ignores trees off the route or already done', () => {
    expect(markTreeInspected(saved, 'zzz', 1)).toBeNull();
    expect(markTreeInspected(saved, 'a', 1)).toBeNull();
  });
});

describe('nextUnassessed', () => {
  it('finds the next tree not in the done set', () => {
    const path = ['a', 'b', 'c'].map(tree);
    expect(nextUnassessed(path, new Set(['b']), 1)).toBe(2);
    expect(nextUnassessed(path, new Set(['b', 'c']), 1)).toBe(-1);
    expect(nextUnassessed(path, new Set(), -5)).toBe(0);
  });
});
