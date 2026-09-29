import { describe, it, expect } from 'vitest';
import { nextScanPosition, blocksInUse, type AddressedTree } from './scan-placement';

const tree = (over: Partial<AddressedTree> = {}): AddressedTree => ({
  block_id: null,
  row_id: null,
  position: null,
  ...over,
});

describe('nextScanPosition', () => {
  it('starts at 1 in an empty orchard', () => {
    expect(nextScanPosition([], '', '')).toBe(1);
  });

  it('carries on from the highest position already there', () => {
    // A second scan of the same place must not restart at 1 and land on
    // top of what the first one saved.
    const trees = [
      tree({ block_id: 'Upper', row_id: '3', position: '1' }),
      tree({ block_id: 'Upper', row_id: '3', position: '7' }),
      tree({ block_id: 'Upper', row_id: '3', position: '4' }),
    ];
    expect(nextScanPosition(trees, 'Upper', '3')).toBe(8);
  });

  it('counts only the block and row being saved to', () => {
    const trees = [
      tree({ block_id: 'Upper', row_id: '3', position: '9' }),
      tree({ block_id: 'Lower', row_id: '3', position: '99' }),
      tree({ block_id: 'Upper', row_id: '4', position: '50' }),
    ];
    expect(nextScanPosition(trees, 'Upper', '3')).toBe(10);
  });

  it('treats blank, null and whitespace as the same absent address', () => {
    const trees = [
      tree({ block_id: null, row_id: null, position: '2' }),
      tree({ block_id: '', row_id: '   ', position: '5' }),
    ];
    expect(nextScanPosition(trees, '', '')).toBe(6);
    expect(nextScanPosition(trees, '  ', '  ')).toBe(6);
  });

  it('does not let an addressed tree raise the mark for unaddressed ones', () => {
    const trees = [tree({ block_id: 'Upper', row_id: '3', position: '80' })];
    expect(nextScanPosition(trees, '', '')).toBe(1);
  });

  it('ignores a position it cannot continue', () => {
    // "3N" is a label, not a number in this sequence. Counting it would
    // hand back 4 and drop a tree onto an existing one.
    const trees = [
      tree({ position: '3N' }),
      tree({ position: 'Espalier' }),
      tree({ position: '2' }),
    ];
    expect(nextScanPosition(trees, '', '')).toBe(3);
  });

  it('ignores a missing position', () => {
    expect(nextScanPosition([tree({ position: null }), tree({ position: '4' })], '', '')).toBe(5);
  });
});

describe('blocksInUse', () => {
  it('lists each block once, sorted', () => {
    const trees = [
      tree({ block_id: 'South' }),
      tree({ block_id: 'North' }),
      tree({ block_id: 'South' }),
    ];
    expect(blocksInUse(trees)).toEqual(['North', 'South']);
  });

  it('leaves out blank and whitespace-only blocks', () => {
    const trees = [tree({ block_id: '' }), tree({ block_id: '   ' }), tree({ block_id: null })];
    expect(blocksInUse(trees)).toEqual([]);
  });

  it('trims what it reports', () => {
    expect(blocksInUse([tree({ block_id: '  Upper  ' })])).toEqual(['Upper']);
  });
});
