import { describe, it, expect } from 'vitest';
import { treesToFeatureCollection } from './trees-geojson';
import type { ClientTree } from './types';

/** A tree as serializeTree hands it to the viewer. */
function tree(id: number, extra: Partial<ClientTree> = {}): ClientTree {
  return {
    id,
    tree_id: `OBC-001-${String(id).padStart(4, '0')}`,
    tree_no: id,
    orchard_id: 'obc',
    status: 'healthy',
    row_id: '3',
    position: String(id),
    lat: 48.1,
    lng: -123.4,
    ...extra,
  };
}

describe('treesToFeatureCollection harvest_complete', () => {
  it('marks a tree picked out this season, and only this season', () => {
    const fc = treesToFeatureCollection(
      [
        tree(1, { harvest_completed_on: '2026-10-17' }),
        tree(2, { harvest_completed_on: '2025-10-02' }),
        tree(3, { harvest_completed_on: null }),
        tree(4),
      ],
      undefined,
      2026
    );
    const flags = fc.features.map((f) => [f.properties.tree_id, f.properties.harvest_complete]);
    console.log('harvest_complete by tree:', flags);
    expect(flags).toEqual([
      ['OBC-001-0001', true],
      ['OBC-001-0002', false],
      ['OBC-001-0003', false],
      ['OBC-001-0004', false],
    ]);
  });

  it('still leaves off unplaced trees and filtered-out statuses', () => {
    const fc = treesToFeatureCollection(
      [
        tree(1, { harvest_completed_on: '2026-10-17', lat: null }),
        tree(2, { harvest_completed_on: '2026-10-17', status: 'dead' }),
        tree(3, { harvest_completed_on: '2026-10-17' }),
      ],
      new Set(['healthy'] as const),
      2026
    );
    expect(fc.features.map((f) => f.id)).toEqual([3]);
    expect(fc.features[0].properties.harvest_complete).toBe(true);
  });
});
