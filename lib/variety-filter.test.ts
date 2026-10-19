import { describe, it, expect } from 'vitest';
import {
  matchesSpecies,
  normalizeSpecies,
  visibleVarieties,
  varietyIsOtherSpecies,
} from './variety-filter';
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

  it('drops another species even when it is growing here', () => {
    // Mantooth, 2026-10-18: Fuji stayed on the pear list because the orchard
    // had Fuji trees, and two pears went in as Fuji.
    const list = [
      option({ name: 'Fuji', fruitType: 'apple', treeCount: 4 }),
      option({ name: 'Conference', fruitType: 'pear' }),
      option({ name: 'Our Seedling', fruitType: null, treeCount: 1 }),
    ];
    const shown = visibleVarieties(list, 'pear').map((o) => o.name);
    console.log('[pear list]', shown);
    expect(shown).toEqual(['Conference', 'Our Seedling']);
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

describe('normalizeSpecies', () => {
  it('stores one spelling per species', () => {
    expect(normalizeSpecies(' Pear ')).toBe('pear');
    expect(normalizeSpecies('APPLE')).toBe('apple');
  });

  it('is empty for nothing', () => {
    expect(normalizeSpecies(null)).toBe('');
    expect(normalizeSpecies(undefined)).toBe('');
    expect(normalizeSpecies('  ')).toBe('');
  });
});

describe('varietyIsOtherSpecies', () => {
  const list = [
    option({ name: 'Fuji', fruitType: 'apple' }),
    option({ name: 'Conference', fruitType: 'pear' }),
    option({ name: 'Our Seedling', fruitType: null }),
  ];

  it('is true for a variety of another species, ignoring case', () => {
    expect(varietyIsOtherSpecies(list, 'fuji', 'Pear')).toBe(true);
  });

  it('is false for a variety of the chosen species', () => {
    expect(varietyIsOtherSpecies(list, 'Conference', 'pear')).toBe(false);
  });

  it('leaves a name with no recorded species alone', () => {
    expect(varietyIsOtherSpecies(list, 'Our Seedling', 'pear')).toBe(false);
  });

  it('leaves a name not on the list alone', () => {
    expect(varietyIsOtherSpecies(list, 'Typed In', 'pear')).toBe(false);
  });

  it('is false with no variety or no species', () => {
    expect(varietyIsOtherSpecies(list, '', 'pear')).toBe(false);
    expect(varietyIsOtherSpecies(list, 'Fuji', '')).toBe(false);
  });
});
