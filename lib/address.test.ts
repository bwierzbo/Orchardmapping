import { describe, it, expect } from 'vitest';
import {
  normalizeRowId,
  normalizeAddress,
  addressKey,
  formatAddress,
  formatTreeLabel,
  isUnplaced,
} from './address';
import { formatTreeId } from './db/trees';

describe('normalizeRowId', () => {
  it('strips leading zeros from numeric rows', () => {
    expect(normalizeRowId('01')).toBe('1');
    expect(normalizeRowId('007')).toBe('7');
    expect(normalizeRowId('12')).toBe('12');
  });

  it('passes non-numeric rows through', () => {
    expect(normalizeRowId('A')).toBe('A');
    expect(normalizeRowId(' B2 ')).toBe('B2');
  });
});

describe('normalizeAddress', () => {
  it('turns every empty form of a part into null', () => {
    expect(normalizeAddress({ block_id: '', row_id: '   ', position: null })).toEqual({
      block_id: null,
      row_id: null,
      position: null,
    });
  });

  it('collapses inner whitespace so "Upper  Block" is one spot', () => {
    expect(normalizeAddress({ block_id: 'Upper  Block' }).block_id).toBe('Upper Block');
  });

  it('normalizes row and position numerically but leaves block alone', () => {
    const a = normalizeAddress({ block_id: '007', row_id: '007', position: '007' });
    expect(a).toEqual({ block_id: '007', row_id: '7', position: '7' });
  });
});

describe('addressKey', () => {
  it('is null for an unplaced tree, so any number of them may coexist', () => {
    expect(addressKey({})).toBeNull();
    expect(addressKey({ block_id: null, row_id: null, position: null })).toBeNull();
    expect(isUnplaced({ row_id: '  ' })).toBe(true);
  });

  it('regression: row "1" and "01" are the same spot', () => {
    expect(addressKey({ row_id: '01', position: '3' })).toBe(addressKey({ row_id: '1', position: '3' }));
  });

  it('distinguishes a block-only address from a row-only one', () => {
    expect(addressKey({ block_id: 'Upper' })).not.toBe(addressKey({ row_id: 'Upper' }));
  });

  it('does not let parts run together: block "A" row "1" is not block "A1"', () => {
    expect(addressKey({ block_id: 'A', row_id: '1' })).not.toBe(addressKey({ block_id: 'A1' }));
  });

  it('treats a missing part and an empty part as the same spot', () => {
    expect(addressKey({ row_id: '3', position: '12' })).toBe(
      addressKey({ block_id: '', row_id: '3', position: '12' })
    );
  });
});

describe('formatAddress', () => {
  it('shows only the parts a tree has', () => {
    expect(formatAddress({ block_id: 'Upper', row_id: '3', position: '12' })).toBe('Upper · R3 · P12');
    expect(formatAddress({ row_id: '3', position: '12' })).toBe('R3 · P12');
    expect(formatAddress({ block_id: 'Upper', position: '5' })).toBe('Upper · P5');
    expect(formatAddress({ block_id: 'Upper' })).toBe('Upper');
  });

  it('says so when a tree is not placed anywhere', () => {
    expect(formatAddress({})).toBe('Unplaced');
  });
});

describe('formatTreeLabel', () => {
  it('leads with the number a person would actually say', () => {
    expect(formatTreeLabel({ tree_no: 142, row_id: '3', position: '12' })).toBe('Tree 142 · R3 · P12');
  });

  it('falls back to the address when a tree has no number yet', () => {
    expect(formatTreeLabel({ row_id: '3', position: '12' })).toBe('R3 · P12');
  });
});

describe('formatTreeId', () => {
  it('is site, orchard and a zero-padded number', () => {
    expect(formatTreeId('OBC', '001', 142)).toBe('OBC-001-0142');
    expect(formatTreeId('OBC', '001', 1)).toBe('OBC-001-0001');
  });

  it('keeps sorting lexically past four digits rather than truncating', () => {
    expect(formatTreeId('OBC', '002', 12345)).toBe('OBC-002-12345');
  });
});
