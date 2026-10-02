/**
 * One way of narrowing a list, used by every list in the app.
 *
 * Four surfaces had four answers: the variety library had nothing at all,
 * the portfolio table two dropdowns, the per-orchard table sortable headers
 * with status chips borrowed from the map legend, and the harvest calendar a
 * toggle beside a select. Finding a variety meant learning whichever one you
 * had landed on.
 *
 * The shape here: free text across named fields, plus any number of chip
 * groups that are OR within a group and AND between groups. That is what
 * people expect of filters without being told -- "Bittersharp or Bittersweet,
 * and late" -- and it is the only combination worth the ambiguity of chips.
 */

/** Case- and punctuation-insensitive, so "hudsons" finds "Hudson's". */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Does this row match the typed text? Every whitespace-separated word must
 * appear somewhere in the searched fields, in any order -- "black kingston"
 * finds Kingston Black, which is how people actually type a half-remembered
 * name.
 */
export function matchesSearch(haystacks: readonly (string | null | undefined)[], query: string): boolean {
  const needle = normalizeForSearch(query);
  if (needle === '') return true;
  const hay = haystacks
    .filter((h): h is string => typeof h === 'string' && h !== '')
    .map(normalizeForSearch)
    .join(' ');
  return needle.split(' ').every((word) => hay.includes(word));
}

/**
 * One chip group: the field it narrows, and which values are chosen.
 * An empty selection means "no opinion", never "match nothing" -- a group
 * nobody has touched must not hide every row.
 */
export interface ChipGroupState<Key extends string = string> {
  key: Key;
  selected: ReadonlySet<string>;
}

/**
 * Does this row pass every chip group? OR inside a group, AND between them.
 * `valuesOf` returns the row's values for a group, so a row can carry more
 * than one -- a tree in two blocks is nonsense, but a variety with two
 * recorded uses is not.
 */
export function matchesChips<Row, Key extends string>(
  row: Row,
  groups: readonly ChipGroupState<Key>[],
  valuesOf: (row: Row, key: Key) => readonly (string | null | undefined)[]
): boolean {
  for (const group of groups) {
    if (group.selected.size === 0) continue;
    const values = valuesOf(row, group.key)
      .filter((v): v is string => typeof v === 'string' && v !== '');
    if (!values.some((v) => group.selected.has(v))) return false;
  }
  return true;
}

/**
 * How many rows each chip would leave, counted against the OTHER groups and
 * the search but not against its own group.
 *
 * Counting a chip against its own group would show "0" beside every chip
 * you had not picked, which is both useless and wrong: tapping one of them
 * widens the result, it does not narrow it.
 */
export function chipCounts<Row, Key extends string>(
  rows: readonly Row[],
  groups: readonly ChipGroupState<Key>[],
  valuesOf: (row: Row, key: Key) => readonly (string | null | undefined)[],
  searchFields: (row: Row) => readonly (string | null | undefined)[],
  query: string
): Record<Key, Record<string, number>> {
  const counts = {} as Record<Key, Record<string, number>>;
  for (const group of groups) {
    const others = groups.filter((g) => g.key !== group.key);
    const tally: Record<string, number> = {};
    for (const row of rows) {
      if (!matchesSearch(searchFields(row), query)) continue;
      if (!matchesChips(row, others, valuesOf)) continue;
      for (const value of valuesOf(row, group.key)) {
        if (typeof value === 'string' && value !== '') {
          tally[value] = (tally[value] ?? 0) + 1;
        }
      }
    }
    counts[group.key] = tally;
  }
  return counts;
}

/** Add or remove one chip from a group's selection. */
export function toggleChip(selected: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(selected);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** True when nothing is narrowing the list, so "Clear" has nothing to do. */
export function isUnfiltered(query: string, groups: readonly ChipGroupState[]): boolean {
  return query.trim() === '' && groups.every((g) => g.selected.size === 0);
}
