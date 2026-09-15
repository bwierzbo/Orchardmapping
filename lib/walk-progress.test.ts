import { describe, it, expect } from 'vitest';
import { newerWalkProgress, normalizeWalkProgress, resumeRoute, type WalkProgress } from './walk-progress';
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
});
