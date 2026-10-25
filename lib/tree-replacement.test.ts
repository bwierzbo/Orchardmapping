import { describe, it, expect } from 'vitest';
import { isCalendarDay, replacementProblems, type TreeReplacementInput } from './tree-replacement';
import { isRemovableEventType } from './event-removal';
import { AUTO_EVENT_TYPES, MANUAL_EVENT_TYPES } from './db/tree-events';

const TODAY = '2026-10-25';

/** The Farm House R11/P1 replacement as the grower described it. */
const farmHouse: TreeReplacementInput = {
  removedOn: '2026-03-01',
  reason: 'Snapped in half',
  plantedOn: '2026-03-01',
  variety: 'Dabinett',
  fruitType: 'apple',
};

describe('isCalendarDay', () => {
  it('accepts real days, leap day included', () => {
    for (const d of ['2026-03-01', '2024-02-29', '2026-12-31']) {
      expect(isCalendarDay(d), d).toBe(true);
    }
  });

  it('refuses days that do not exist and strings that are not dates', () => {
    for (const d of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-3-1', '', 'March 2026']) {
      expect(isCalendarDay(d), JSON.stringify(d)).toBe(false);
    }
  });
});

describe('replacementProblems', () => {
  it('has nothing to say about a same-day replacement in the past', () => {
    const problems = replacementProblems(farmHouse, TODAY);
    expect(problems, problems.join(' | ')).toEqual([]);
  });

  it('allows the new tree to go in later than the old one came out', () => {
    expect(replacementProblems({ ...farmHouse, plantedOn: '2026-04-15' }, TODAY)).toEqual([]);
  });

  it('allows both on today, the grower\'s own calendar day', () => {
    expect(replacementProblems({ ...farmHouse, removedOn: TODAY, plantedOn: TODAY }, TODAY)).toEqual([]);
  });

  it('refuses a new tree planted before the old one came out', () => {
    const problems = replacementProblems({ ...farmHouse, plantedOn: '2026-02-28' }, TODAY);
    expect(problems).toEqual(['The new tree cannot go in before the old one came out.']);
  });

  it('refuses either date in the future, and says which', () => {
    const problems = replacementProblems(
      { ...farmHouse, removedOn: '2026-10-26', plantedOn: '2026-10-27' },
      TODAY
    );
    expect(problems).toEqual([
      'The old tree cannot come out on a day still to come.',
      'The new tree cannot go in on a day still to come.',
    ]);
  });

  it('needs a variety for the new tree; whitespace is not one', () => {
    expect(replacementProblems({ ...farmHouse, variety: '   ' }, TODAY)).toEqual([
      'Say what variety was planted.',
    ]);
  });

  it('reports a missing date without also comparing it to the other', () => {
    const problems = replacementProblems({ ...farmHouse, removedOn: '' }, TODAY);
    expect(problems).toEqual(['Say which day the old tree came out.']);
  });

  it('does not need a reason, rootstock or source', () => {
    expect(
      replacementProblems({ removedOn: '2026-03-01', plantedOn: '2026-03-01', variety: 'Dabinett' }, TODAY)
    ).toEqual([]);
  });
});

describe('replacement history rows', () => {
  it('are written by the app, not offered in the log menu', () => {
    for (const t of ['removed', 'replanted']) {
      expect((AUTO_EVENT_TYPES as readonly string[]).includes(t), `${t} is automatic`).toBe(true);
      expect((MANUAL_EVENT_TYPES as readonly string[]).includes(t), `${t} is not manual`).toBe(false);
    }
  });

  it('cannot be deleted from a tree\'s history', () => {
    // Deleting one would leave removed_on / replaces_tree_id set with no
    // record of when, why or by whom.
    expect(isRemovableEventType('removed')).toBe(false);
    expect(isRemovableEventType('replanted')).toBe(false);
  });
});
