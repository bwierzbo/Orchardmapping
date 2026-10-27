import { describe, it, expect } from 'vitest';
import {
  describeGraftPlace,
  graftProblems,
  picksByVariety,
  treeVarieties,
  varietyCompletions,
  wholeTreeCompletedOn,
  type GraftStatus,
} from './grafts';

const TODAY = '2026-10-26';

function graft(
  variety: string,
  status: GraftStatus = 'growing',
  harvest_completed_on: string | null = null
) {
  return { variety, status, harvest_completed_on };
}

describe('describeGraftPlace', () => {
  it('says tier and scaffold the way they are said at the tree', () => {
    expect(describeGraftPlace({ scaffold_direction: 'NE', scaffold_tier: 2 })).toBe('2nd tier, NE scaffold');
    expect(describeGraftPlace({ scaffold_direction: 'S', scaffold_tier: null })).toBe('S scaffold');
    expect(describeGraftPlace({ scaffold_direction: null, scaffold_tier: 1 })).toBe('1st tier');
    expect(describeGraftPlace({ scaffold_direction: null, scaffold_tier: null })).toBeNull();
  });
});

describe('treeVarieties', () => {
  it('lists the tree\'s own variety first, then each growing graft', () => {
    expect(treeVarieties('Gala', [graft('Chehalis')])).toEqual(['Gala', 'Chehalis']);
  });

  it('leaves out grafts that did not take or were cut out', () => {
    expect(treeVarieties('Gala', [graft('Chehalis', 'failed'), graft('Kingston Black', 'removed')])).toEqual([
      'Gala',
    ]);
  });

  it('counts a variety once, however many limbs carry it or how it is spelled', () => {
    expect(treeVarieties('Gala', [graft('gala '), graft('Chehalis'), graft('CHEHALIS')])).toEqual([
      'Gala',
      'Chehalis',
    ]);
  });

  it('lists only the grafts on a tree with no variety of its own recorded', () => {
    expect(treeVarieties(null, [graft('Chehalis')])).toEqual(['Chehalis']);
    expect(treeVarieties(null, [])).toEqual([]);
  });
});

describe('picksByVariety', () => {
  it('is false for a one-variety tree, so its pick form does not change', () => {
    expect(picksByVariety('Gala', [])).toBe(false);
    expect(picksByVariety('Gala', [graft('Gala')])).toBe(false);
    expect(picksByVariety('Gala', [graft('Chehalis', 'failed')])).toBe(false);
  });

  it('is true once a second variety is growing on it', () => {
    expect(picksByVariety('Gala', [graft('Chehalis')])).toBe(true);
  });
});

describe('varietyCompletions and wholeTreeCompletedOn', () => {
  it('keeps the tree open while any variety still has fruit', () => {
    const c = varietyCompletions('Gala', null, [graft('Chehalis', 'growing', '2026-09-06')]);
    expect(c).toEqual([
      { variety: 'Gala', completedOn: null },
      { variety: 'Chehalis', completedOn: '2026-09-06' },
    ]);
    expect(wholeTreeCompletedOn(c, 2026)).toBeNull();
  });

  it('closes the tree on the day its last variety was picked out', () => {
    const c = varietyCompletions('Gala', '2026-09-28', [graft('Chehalis', 'growing', '2026-09-06')]);
    expect(wholeTreeCompletedOn(c, 2026)).toBe('2026-09-28');
  });

  it('treats a variety closed last year as still to pick this year', () => {
    const c = varietyCompletions('Gala', '2026-09-28', [graft('Chehalis', 'growing', '2025-09-06')]);
    expect(wholeTreeCompletedOn(c, 2026)).toBeNull();
  });

  it('ignores a graft that was cut out, so it cannot hold the tree open', () => {
    const c = varietyCompletions('Gala', '2026-09-28', [graft('Chehalis', 'removed', null)]);
    expect(c).toEqual([{ variety: 'Gala', completedOn: '2026-09-28' }]);
    expect(wholeTreeCompletedOn(c, 2026)).toBe('2026-09-28');
  });

  it('needs every limb of a variety closed before that variety is', () => {
    const c = varietyCompletions('Gala', '2026-09-28', [
      graft('Chehalis', 'growing', '2026-09-06'),
      graft('Chehalis', 'growing', null),
    ]);
    expect(c[1]).toEqual({ variety: 'Chehalis', completedOn: null });
  });

  it('is never complete for a tree with no varieties', () => {
    expect(wholeTreeCompletedOn([], 2026)).toBeNull();
  });
});

describe('graftProblems', () => {
  it('accepts a graft with only its variety', () => {
    expect(graftProblems({ variety: 'Chehalis' }, TODAY)).toEqual([]);
  });

  it('needs a variety', () => {
    expect(graftProblems({ variety: '  ' }, TODAY)).toEqual(['Say which variety was grafted.']);
  });

  it('refuses dates in the future and a failure before the graft', () => {
    expect(graftProblems({ variety: 'Chehalis', grafted_on: '2026-10-27' }, TODAY)).toEqual([
      'A graft cannot be dated in the future.',
    ]);
    expect(
      graftProblems({ variety: 'Chehalis', grafted_on: '2026-04-10', status: 'failed', status_on: '2026-04-01' }, TODAY)
    ).toEqual(['The graft cannot fail or be cut out before it was grafted.']);
  });

  it('refuses something that is not a date', () => {
    expect(graftProblems({ variety: 'Chehalis', grafted_on: 'spring' }, TODAY)).toEqual([
      'The graft date is not a date.',
    ]);
  });
});
