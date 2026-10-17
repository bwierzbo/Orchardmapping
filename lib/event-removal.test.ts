import { describe, it, expect } from 'vitest';
import {
  isEmptyWithoutPhoto,
  isRemovableEventType,
  PERMANENT_EVENT_TYPES,
  statusAfterRemoval,
} from './event-removal';
import { AUTO_EVENT_TYPES, MANUAL_EVENT_TYPES } from './db/tree-events';

describe('which history rows can be deleted', () => {
  it('allows everything the Inspect form and the log menu write', () => {
    for (const t of MANUAL_EVENT_TYPES) {
      expect(isRemovableEventType(t), `${t} should be removable`).toBe(true);
    }
  });

  it('allows the status change an inspection makes', () => {
    // Without this a Healthy tapped on the wrong tree could never be taken back.
    expect(isRemovableEventType('status_change')).toBe(true);
  });

  it('keeps the audit trail of edits to the tree itself', () => {
    for (const t of ['created', 'updated', 'moved', 'deleted']) {
      expect(isRemovableEventType(t), `${t} should stay`).toBe(false);
    }
  });

  it('keeps harvest complete and reopened, whose undo is the opposite button', () => {
    // Deleting the row would leave trees.harvest_completed_on set with no
    // history saying when or by whom.
    for (const t of ['harvest_complete', 'harvest_reopened']) {
      expect(isRemovableEventType(t), `${t} should stay`).toBe(false);
    }
  });

  it('only ever protects automatic types', () => {
    // A manual type in the permanent list would be a row the user wrote
    // and can never remove.
    const auto = new Set<string>(AUTO_EVENT_TYPES);
    for (const t of PERMANENT_EVENT_TYPES) expect(auto.has(t), t).toBe(true);
  });
});

describe('statusAfterRemoval', () => {
  const removed = { from: 'unknown', to: 'healthy' };

  it('puts the tree back to what it was before a lone status change', () => {
    // The R11-R13 case: a first inspection set unknown -> healthy on the
    // wrong tree. Deleting it must leave the tree unknown again.
    expect(
      statusAfterRemoval({ current: 'healthy', removed, removedIsLatest: true, previousTo: null })
    ).toBe('unknown');
  });

  it('falls back to the previous remaining status change, not the removed one', () => {
    // Healthy on Oct 1, stressed by mistake on Oct 12: deleting Oct 12
    // returns to the Oct 1 verdict.
    expect(
      statusAfterRemoval({
        current: 'stressed',
        removed: { from: 'healthy', to: 'stressed' },
        removedIsLatest: true,
        previousTo: 'healthy',
      })
    ).toBe('healthy');
  });

  it('leaves the tree alone when an older status change is deleted', () => {
    expect(
      statusAfterRemoval({ current: 'stressed', removed, removedIsLatest: false, previousTo: 'stressed' })
    ).toBeNull();
  });

  it('does not clobber a status set since by some other path', () => {
    // Removed change said healthy, but somebody has since marked it dead
    // through the edit form, which wrote no status_change of its own.
    expect(
      statusAfterRemoval({ current: 'dead', removed, removedIsLatest: true, previousTo: null })
    ).toBeNull();
  });

  it('uses unknown when the removed change had no from', () => {
    expect(
      statusAfterRemoval({
        current: 'healthy',
        removed: { from: null, to: 'healthy' },
        removedIsLatest: true,
        previousTo: null,
      })
    ).toBe('unknown');
  });
});

describe('isEmptyWithoutPhoto', () => {
  it('a photo taken on its own is nothing once the photo goes', () => {
    expect(isEmptyWithoutPhoto({ event_type: 'observation', detail: null, changes: null })).toBe(true);
    expect(isEmptyWithoutPhoto({ event_type: 'observation', detail: '   ', changes: {} })).toBe(true);
  });

  it('a photo with a note keeps the note', () => {
    expect(
      isEmptyWithoutPhoto({ event_type: 'observation', detail: 'Last pic is correct.', changes: null })
    ).toBe(false);
  });

  it('a photo on a structured observation keeps the observation', () => {
    expect(
      isEmptyWithoutPhoto({ event_type: 'observation', detail: null, changes: { pests: { scab: null } } })
    ).toBe(false);
  });

  it('a spray with a photo is still a spray', () => {
    expect(isEmptyWithoutPhoto({ event_type: 'spray', detail: null, changes: null })).toBe(false);
  });
});
