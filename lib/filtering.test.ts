import { describe, it, expect } from 'vitest';
import {
  normalizeForSearch,
  matchesSearch,
  matchesChips,
  chipCounts,
  toggleChip,
  isUnfiltered,
  selectedFirst,
  type ChipGroupState,
} from './filtering';

interface Row {
  variety: string;
  cls: string | null;
  harvest: string | null;
}
const rows: Row[] = [
  { variety: 'Kingston Black', cls: 'BSH', harvest: 'Late' },
  { variety: 'Brown Snout', cls: 'BSW', harvest: 'Late' },
  { variety: 'Stoke Red', cls: 'BSH', harvest: 'Mid' },
  { variety: "Hudson's Golden Gem", cls: 'dessert', harvest: 'Mid' },
  { variety: 'Dabinett', cls: 'BSW', harvest: null },
];
const valuesOf = (r: Row, key: 'cls' | 'harvest') => [key === 'cls' ? r.cls : r.harvest];
const fields = (r: Row) => [r.variety, r.cls];
const group = (key: 'cls' | 'harvest', ...selected: string[]): ChipGroupState<'cls' | 'harvest'> => ({
  key,
  selected: new Set(selected),
});

describe('normalizeForSearch', () => {
  it('folds case, apostrophes and punctuation', () => {
    expect(normalizeForSearch("Hudson's Golden Gem")).toBe('hudsons golden gem');
    expect(normalizeForSearch('Court-Pendu Plat')).toBe('court pendu plat');
  });

  it('collapses and trims whitespace', () => {
    expect(normalizeForSearch('  Kingston   Black  ')).toBe('kingston black');
  });
});

describe('matchesSearch', () => {
  it('matches everything on an empty query', () => {
    expect(matchesSearch(['Kingston Black'], '')).toBe(true);
    expect(matchesSearch(['Kingston Black'], '   ')).toBe(true);
  });

  it('matches a partial word', () => {
    expect(matchesSearch(['Kingston Black'], 'king')).toBe(true);
  });

  it('matches words in any order, which is how people half-remember a name', () => {
    expect(matchesSearch(['Kingston Black'], 'black kingston')).toBe(true);
  });

  it('needs every word to appear', () => {
    expect(matchesSearch(['Kingston Black'], 'kingston pippin')).toBe(false);
  });

  it('finds a name through its apostrophe', () => {
    expect(matchesSearch(["Hudson's Golden Gem"], 'hudsons')).toBe(true);
    expect(matchesSearch(["Hudson's Golden Gem"], "hudson's")).toBe(true);
  });

  it('searches every field it is given', () => {
    expect(matchesSearch(['Dabinett', 'bittersweet'], 'bittersweet')).toBe(true);
  });

  it('ignores a null or empty field rather than matching it', () => {
    expect(matchesSearch([null, undefined, '', 'Dabinett'], 'dabinett')).toBe(true);
    expect(matchesSearch([null], 'anything')).toBe(false);
  });
});

describe('matchesChips', () => {
  it('passes everything when no group has a selection', () => {
    // An untouched group means "no opinion", never "match nothing".
    expect(rows.every((r) => matchesChips(r, [group('cls'), group('harvest')], valuesOf))).toBe(true);
  });

  it('is OR inside one group', () => {
    const g = [group('cls', 'BSH', 'BSW')];
    expect(rows.filter((r) => matchesChips(r, g, valuesOf)).map((r) => r.variety)).toEqual([
      'Kingston Black',
      'Brown Snout',
      'Stoke Red',
      'Dabinett',
    ]);
  });

  it('is AND between groups', () => {
    const g = [group('cls', 'BSH'), group('harvest', 'Late')];
    expect(rows.filter((r) => matchesChips(r, g, valuesOf)).map((r) => r.variety)).toEqual([
      'Kingston Black',
    ]);
  });

  it('drops a row whose value for a selected group is missing', () => {
    // Dabinett has no harvest window; asking for Late cannot include it.
    const g = [group('harvest', 'Late')];
    expect(rows.filter((r) => matchesChips(r, g, valuesOf)).map((r) => r.variety)).not.toContain(
      'Dabinett'
    );
  });
});

describe('chipCounts', () => {
  it('counts each value across the whole list when nothing is filtered', () => {
    const counts = chipCounts(rows, [group('cls'), group('harvest')], valuesOf, fields, '');
    expect(counts.cls).toEqual({ BSH: 2, BSW: 2, dessert: 1 });
    expect(counts.harvest).toEqual({ Late: 2, Mid: 2 });
  });

  it('narrows a group by the OTHER groups', () => {
    const counts = chipCounts(rows, [group('cls'), group('harvest', 'Late')], valuesOf, fields, '');
    // Only the two Late varieties feed the class counts.
    expect(counts.cls).toEqual({ BSH: 1, BSW: 1 });
  });

  it('does not narrow a group by its own selection', () => {
    // Counting a chip against its own group would show 0 beside every chip
    // you had not picked — tapping one WIDENS the result.
    const counts = chipCounts(rows, [group('cls', 'BSH')], valuesOf, fields, '');
    expect(counts.cls).toEqual({ BSH: 2, BSW: 2, dessert: 1 });
  });

  it('narrows every group by the search text', () => {
    const counts = chipCounts(rows, [group('cls'), group('harvest')], valuesOf, fields, 'kingston');
    expect(counts.cls).toEqual({ BSH: 1 });
    expect(counts.harvest).toEqual({ Late: 1 });
  });

  it('leaves out a value no row carries rather than showing it as zero', () => {
    const counts = chipCounts(rows, [group('cls')], valuesOf, fields, 'kingston');
    expect(counts.cls.BSW).toBeUndefined();
  });
});

describe('toggleChip', () => {
  it('adds and removes', () => {
    expect([...toggleChip(new Set(), 'BSH')]).toEqual(['BSH']);
    expect([...toggleChip(new Set(['BSH']), 'BSH')]).toEqual([]);
  });

  it('does not mutate what it was given', () => {
    const before = new Set(['BSH']);
    toggleChip(before, 'BSW');
    expect([...before]).toEqual(['BSH']);
  });
});

describe('isUnfiltered', () => {
  it('is true when nothing narrows the list', () => {
    expect(isUnfiltered('', [group('cls'), group('harvest')])).toBe(true);
    expect(isUnfiltered('   ', [group('cls')])).toBe(true);
  });

  it('is false once anything does', () => {
    expect(isUnfiltered('king', [group('cls')])).toBe(false);
    expect(isUnfiltered('', [group('cls', 'BSH')])).toBe(false);
  });
});

describe('selectedFirst', () => {
  const chips = [
    { value: 'a', count: 9 },
    { value: 'b', count: 5 },
    { value: 'c', count: 3 },
    { value: 'd', count: 1 },
  ];

  it('leaves the order alone when nothing is selected', () => {
    expect(selectedFirst(chips, new Set()).map((c) => c.value)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('floats a selected chip to the front', () => {
    expect(selectedFirst(chips, new Set(['c'])).map((c) => c.value)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('keeps the callers order within each half', () => {
    // 'd' and 'b' were sorted by count by the caller; selecting them must
    // not reshuffle them relative to each other.
    expect(selectedFirst(chips, new Set(['b', 'd'])).map((c) => c.value)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
  });

  it('does not mutate the input', () => {
    const original = [...chips];
    selectedFirst(chips, new Set(['d']));
    expect(chips).toEqual(original);
  });

  it('ignores a selection for a chip that is not there', () => {
    expect(selectedFirst(chips, new Set(['zz'])).map((c) => c.value)).toEqual(['a', 'b', 'c', 'd']);
  });
});
