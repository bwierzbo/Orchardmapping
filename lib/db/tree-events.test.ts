import { describe, it, expect } from 'vitest';
import {
  AUTO_EVENT_TYPES,
  MANUAL_EVENT_TYPES,
  SURVEY_EVENT_TYPES,
} from './tree-events';

/**
 * The Inspect form writes these four. Each one that is missing from
 * MANUAL_EVENT_TYPES is rejected by the API at the moment of saving, in the
 * orchard, with the rest of the inspection saving around it -- which is
 * exactly what happened to tree_condition and harvest_readiness: every
 * canker count and picking verdict was discarded for weeks while the error
 * looked cosmetic.
 */
describe('event types the Inspect form writes', () => {
  it('are all accepted by the API', () => {
    for (const t of SURVEY_EVENT_TYPES) {
      expect(MANUAL_EVENT_TYPES).toContain(t);
    }
  });

  it('includes the two that were missing', () => {
    expect(MANUAL_EVENT_TYPES).toContain('tree_condition');
    expect(MANUAL_EVENT_TYPES).toContain('harvest_readiness');
  });

  it('still accepts the hand-logged activities', () => {
    for (const t of ['pruning', 'spray', 'fertilize', 'observation', 'harvest', 'note']) {
      expect(MANUAL_EVENT_TYPES).toContain(t);
    }
  });
});

describe('the two families stay apart', () => {
  it('shares nothing with the automatic audit types', () => {
    const auto = new Set<string>(AUTO_EVENT_TYPES);
    const overlap = MANUAL_EVENT_TYPES.filter((t) => auto.has(t));
    expect(overlap).toEqual([]);
  });

  it('has no duplicates', () => {
    expect(new Set(MANUAL_EVENT_TYPES).size).toBe(MANUAL_EVENT_TYPES.length);
  });

  it('matches what the database check constraint allows', () => {
    // Mirrors migration 013/069's CHECK. A type added here and not there
    // fails on write; added there and not here, it fails validation first.
    const allowedInDb = [
      'created', 'updated', 'status_change', 'moved', 'deleted',
      'pruning', 'spray', 'fertilize', 'observation', 'harvest', 'note',
      'bloom', 'fruit_check', 'tree_condition', 'harvest_readiness',
    ];
    const all = [...AUTO_EVENT_TYPES, ...MANUAL_EVENT_TYPES];
    expect([...all].sort()).toEqual([...allowedInDb].sort());
  });
});
