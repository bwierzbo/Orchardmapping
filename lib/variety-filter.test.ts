import { describe, it, expect } from 'vitest';
import { matchesSpecies, visibleVarieties, varietyDescription } from './variety-filter';
import type { VarietyOption } from './db/varieties';

const option = (over: Partial<VarietyOption> = {}): VarietyOption => ({
  name: 'Kingston Black',
  summary: 'bittersharp',
  inLibrary: true,
  treeCount: 0,
  fruitType: 'apple',
  ...over,
});

describe('matchesSpecies', () => {
  it('keeps everything when no species is chosen', () => {
    expect(matchesSpecies(option({ fruitType: 'plum' }), undefined)).toBe(true);
    expect(matchesSpecies(option({ fruitType: 'plum' }), '')).toBe(true);
    expect(matchesSpecies(option({ fruitType: 'plum' }), '   ')).toBe(true);
  });

  it('matches the chosen species, ignoring case and padding', () => {
    expect(matchesSpecies(option({ fruitType: 'apple' }), 'Apple')).toBe(true);
    expect(matchesSpecies(option({ fruitType: 'Apple' }), ' apple ')).toBe(true);
  });

  it('drops another species', () => {
    expect(matchesSpecies(option({ fruitType: 'pear' }), 'apple')).toBe(false);
  });

  it("keeps a name whose species the library does not know", () => {
    // A grower's own seedling has no recorded species. Hiding it would make
    // them retype a name that already exists.
    expect(matchesSpecies(option({ fruitType: null }), 'apple')).toBe(true);
  });
});

describe('visibleVarieties', () => {
  it('narrows to the chosen species', () => {
    const list = [
      option({ name: 'Kingston Black', fruitType: 'apple' }),
      option({ name: 'Conference', fruitType: 'pear' }),
      option({ name: 'Victoria', fruitType: 'plum' }),
    ];
    expect(visibleVarieties(list, 'pear').map((o) => o.name)).toEqual(['Conference']);
  });

  it('keeps something already growing here even when the species differs', () => {
    // The orchard has it recorded as a pear; the person is placing apples.
    // It stays, so an existing tree can still be matched to its own name.
    const list = [
      option({ name: 'Kingston Black', fruitType: 'apple' }),
      option({ name: 'Old Bremerton', fruitType: 'pear', treeCount: 12 }),
    ];
    expect(visibleVarieties(list, 'apple').map((o) => o.name)).toEqual([
      'Kingston Black',
      'Old Bremerton',
    ]);
  });

  it('keeps the incoming order', () => {
    const list = [
      option({ name: 'Brown Snout' }),
      option({ name: 'Dabinett' }),
      option({ name: 'Ashmead' }),
    ];
    expect(visibleVarieties(list, 'apple').map((o) => o.name)).toEqual([
      'Brown Snout',
      'Dabinett',
      'Ashmead',
    ]);
  });

  it('returns everything when no species is chosen', () => {
    const list = [option({ fruitType: 'apple' }), option({ fruitType: 'plum' })];
    expect(visibleVarieties(list, null)).toHaveLength(2);
  });
});

describe('varietyDescription', () => {
  it('is the summary when the species matches', () => {
    expect(varietyDescription(option({ summary: 'bittersharp' }), 'apple')).toBe('bittersharp');
  });

  it('is the summary when no species is chosen', () => {
    expect(varietyDescription(option({ summary: 'bittersharp' }), undefined)).toBe('bittersharp');
  });

  it('explains why an off-species name is still listed', () => {
    const text = varietyDescription(
      option({ summary: 'late', fruitType: 'pear', treeCount: 3 }),
      'apple'
    );
    expect(text).toBe('late · pear, already here');
  });

  it('explains it even with nothing else to say', () => {
    expect(
      varietyDescription(option({ summary: null, fruitType: 'pear', treeCount: 3 }), 'apple')
    ).toBe('pear, already here');
  });

  it('is undefined rather than empty when there is nothing to show', () => {
    expect(varietyDescription(option({ summary: null }), 'apple')).toBeUndefined();
  });
});
