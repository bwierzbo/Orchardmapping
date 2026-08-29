import { describe, it, expect } from 'vitest';
import { generateTreeId, normalizeRowId } from './trees';

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

describe('generateTreeId', () => {
  it('pads row and position', () => {
    expect(generateTreeId('washington', '1', 1)).toBe('washington-R01-P001');
    expect(generateTreeId('washington', '12', 34)).toBe('washington-R12-P034');
  });

  it('regression: row "1" and "01" produce the same id', () => {
    expect(generateTreeId('wa', '01', 3)).toBe(generateTreeId('wa', '1', 3));
  });
});
