import { describe, it, expect } from 'vitest';
import { findTrees, type FindableTree } from './find-tree';

// A slice of Olympic Bluffs: R13 Kingston Blacks, one unknown at P22, and
// a named row that is not a number.
const TREES: FindableTree[] = [
  { tree_id: 'OBC-001-0397', tree_no: 397, row_id: '13', position: '13', variety: 'Kingston Black' },
  { tree_id: 'OBC-001-0405', tree_no: 405, row_id: '13', position: '21', variety: 'Kingston Black' },
  { tree_id: 'OBC-001-0406', tree_no: 406, row_id: '13', position: '22', variety: 'Unknown' },
  { tree_id: 'OBC-001-0373', tree_no: 373, row_id: '12', position: '21', variety: 'Kingston Black' },
  { tree_id: 'OBC-001-0021', tree_no: 21, row_id: '1', position: '3', variety: 'Dabinett', legacy_tree_id: 'finn-hall-R01-P003' },
  { tree_id: 'OBC-001-0500', tree_no: 500, row_id: 'Espalier', position: '2', variety: 'Ashmead’s Kernel' },
  { tree_id: 'OBC-001-0501', tree_no: 501, row_id: 'Espalier', position: '3', variety: 'Pippin' },
];

const ids = (q: string) => findTrees(TREES, q).trees.map((t) => t.tree_id);

describe('findTrees', () => {
  it('finds one tree by its address however it is typed', () => {
    for (const q of ['R13 P21', 'r13p21', 'R13 · P21', '13-21', '13/21', '13 21', ' r 13 p 21 ']) {
      expect(ids(q), q).toEqual(['OBC-001-0405']);
    }
  });

  it('does not confuse R13 P21 with R12 P21 or R13 P22', () => {
    // The R13 shift on 12 Oct was exactly a neighbour picked by mistake.
    expect(ids('R12 P21')).toEqual(['OBC-001-0373']);
    expect(ids('R13 P22')).toEqual(['OBC-001-0406']);
  });

  it('ignores leading zeros the way addresses are stored', () => {
    expect(ids('R01 P003')).toEqual(['OBC-001-0021']);
  });

  it('finds an address in a named row', () => {
    expect(ids('Espalier P2')).toEqual(['OBC-001-0500']);
  });

  it('reads a bare number as the tree number, not a row', () => {
    expect(ids('405')).toEqual(['OBC-001-0405']);
    expect(ids('tree 405')).toEqual(['OBC-001-0405']);
    expect(ids('#21')).toEqual(['OBC-001-0021']);
  });

  it('finds a tree by its permanent or legacy id, any case', () => {
    expect(ids('obc-001-0406')).toEqual(['OBC-001-0406']);
    expect(ids('finn-hall-R01-P003')).toEqual(['OBC-001-0021']);
  });

  it('lists a whole row in walking order', () => {
    expect(ids('R13')).toEqual(['OBC-001-0397', 'OBC-001-0405', 'OBC-001-0406']);
  });

  it('matches every word of a variety', () => {
    const found = ids('kingston black');
    console.log('kingston black ->', found);
    expect(found).toEqual(['OBC-001-0373', 'OBC-001-0397', 'OBC-001-0405']);
    expect(ids('black kingston')).toHaveLength(3);
  });

  it('does not read a variety that happens to contain a p as an address', () => {
    expect(ids('pippin')).toEqual(['OBC-001-0501']);
    expect(ids('pip')).toEqual(['OBC-001-0501']);
  });

  it('caps the list but says how many matched', () => {
    const r = findTrees(TREES, 'kingston', 2);
    expect(r.trees).toHaveLength(2);
    expect(r.total).toBe(3);
  });

  it('finds nothing for nothing, and for a tree that is not there', () => {
    expect(findTrees(TREES, '   ')).toEqual({ trees: [], total: 0 });
    expect(ids('R13 P99')).toEqual([]);
    expect(ids('9999')).toEqual([]);
  });
});
