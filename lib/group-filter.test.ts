import { describe, it, expect } from 'vitest';
import { filterTrees, describeFilter } from './group-filter';
import type { ClientTree } from './types';

const mk = (over: Partial<ClientTree>): ClientTree =>
  ({
    id: 1,
    tree_id: 't',
    orchard_id: 'o',
    status: 'healthy',
    ...over,
  }) as ClientTree;

const trees = [
  mk({ tree_id: 'a', row_id: '1', variety: 'Cox', status: 'healthy' }),
  mk({ tree_id: 'b', row_id: '01', variety: 'Cox', status: 'stressed' }),
  mk({ tree_id: 'c', row_id: '2', variety: 'Spy', status: 'healthy', block_id: 'B' }),
  mk({ tree_id: 'd', row_id: '3', variety: 'Spy', status: 'dead' }),
];

describe('filterTrees', () => {
  it('empty filter selects everything', () => {
    expect(filterTrees(trees, {})).toHaveLength(4);
  });

  it('dimensions AND together, values within a dimension OR', () => {
    expect(filterTrees(trees, { varieties: ['Cox', 'Spy'] })).toHaveLength(4);
    expect(filterTrees(trees, { varieties: ['Spy'], statuses: ['dead'] }).map((t) => t.tree_id)).toEqual(['d']);
  });

  it('normalizes row ids so "1" and "01" match', () => {
    expect(filterTrees(trees, { rows: ['01'] }).map((t) => t.tree_id)).toEqual(['a', 'b']);
  });

  it('block filter excludes trees without a block', () => {
    expect(filterTrees(trees, { blocks: ['B'] }).map((t) => t.tree_id)).toEqual(['c']);
  });
});

describe('describeFilter', () => {
  it('summarizes composed filters and the empty case', () => {
    expect(describeFilter({})).toBe('whole orchard');
    expect(describeFilter({ rows: ['6', '7'], varieties: ['Kingston Black'] })).toBe(
      'rows 6, 7 · Kingston Black'
    );
  });
});
