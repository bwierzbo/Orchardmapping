import { describe, it, expect } from 'vitest';
import { namedOrchardId, idsOutside } from './tenant-input';

describe('namedOrchardId', () => {
  it('reads either spelling', () => {
    expect(namedOrchardId({ orchardId: 'finn-hall' })).toEqual({ ok: true, orchardId: 'finn-hall' });
    expect(namedOrchardId({ orchard_id: 'finn-hall' })).toEqual({ ok: true, orchardId: 'finn-hall' });
  });

  it('accepts both spellings when they agree', () => {
    expect(namedOrchardId({ orchardId: 'a', orchard_id: 'a' })).toEqual({ ok: true, orchardId: 'a' });
  });

  // The hole this exists to close: the guard checked `orchardId` (an
  // orchard the caller belongs to) while tree.create wrote `orchard_id`.
  it('refuses two spellings naming different orchards', () => {
    expect(namedOrchardId({ orchardId: 'mine', orchard_id: 'theirs' })).toEqual({
      ok: false,
      reason: 'conflict',
    });
    expect(namedOrchardId({ orchardId: 'theirs', orchard_id: 'mine' })).toEqual({
      ok: false,
      reason: 'conflict',
    });
  });

  it('refuses a real id beside a spelling that is not a string', () => {
    expect(namedOrchardId({ orchardId: 'mine', orchard_id: 7 })).toEqual({
      ok: false,
      reason: 'conflict',
    });
    expect(namedOrchardId({ orchardId: ['theirs'], orchard_id: 'mine' })).toEqual({
      ok: false,
      reason: 'conflict',
    });
    expect(namedOrchardId({ orchardId: '', orchard_id: 'mine' })).toEqual({
      ok: false,
      reason: 'conflict',
    });
  });

  it('reports a missing id', () => {
    for (const raw of [null, undefined, {}, 'finn-hall', { orchardId: '' }, { orchard_id: 3 }]) {
      expect(namedOrchardId(raw)).toEqual({ ok: false, reason: 'missing' });
    }
  });

  it('treats null and undefined spellings as absent, not as a conflict', () => {
    expect(namedOrchardId({ orchardId: 'a', orchard_id: null })).toEqual({ ok: true, orchardId: 'a' });
    expect(namedOrchardId({ orchardId: undefined, orchard_id: 'a' })).toEqual({
      ok: true,
      orchardId: 'a',
    });
  });
});

describe('idsOutside', () => {
  it('is empty when every wanted id is allowed', () => {
    expect(idsOutside([3, 1], [1, 2, 3])).toEqual([]);
    expect(idsOutside([], [])).toEqual([]);
  });

  // trap.recordCounts: one trap of another orchard among this orchard's.
  it('names the ids that are not allowed, in the order asked, once each', () => {
    expect(idsOutside([1, 99, 2, 98, 99], [1, 2])).toEqual([99, 98]);
  });

  it('allows nothing when nothing is owned', () => {
    expect(idsOutside([5], [])).toEqual([5]);
  });
});
