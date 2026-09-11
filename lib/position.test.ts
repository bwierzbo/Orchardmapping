import { describe, it, expect } from 'vitest';
import {
  normalizePosition,
  comparePositions,
  nextPosition,
  positionIdPart,
  rowIdPart,
} from './position';

describe('normalizePosition', () => {
  it('strips leading zeros from pure numbers', () => {
    expect(normalizePosition('007')).toBe('7');
    expect(normalizePosition(12)).toBe('12');
  });
  it('preserves alphanumeric labels, collapsing whitespace', () => {
    expect(normalizePosition(' 1N ')).toBe('1N');
    expect(normalizePosition('bay  3')).toBe('bay 3');
  });
});

describe('comparePositions', () => {
  it('orders numerically within labels', () => {
    const sorted = ['10', '2', '1'].sort(comparePositions);
    expect(sorted).toEqual(['1', '2', '10']);
    expect(['2N', '10N', '1N'].sort(comparePositions)).toEqual(['1N', '2N', '10N']);
    expect(['A10', 'A2'].sort(comparePositions)).toEqual(['A2', 'A10']);
  });
});

describe('nextPosition', () => {
  it('advances trailing numbers, preserving suffix and padding', () => {
    expect(nextPosition('5')).toBe('6');
    expect(nextPosition('09')).toBe('10');
    expect(nextPosition('1N')).toBe('2N');
    expect(nextPosition('A3-b')).toBe('A4-b');
  });
  it('returns null when there is nothing to advance', () => {
    expect(nextPosition('north')).toBeNull();
    expect(nextPosition('')).toBeNull();
  });
});

describe('positionIdPart', () => {
  it('pads pure numbers to the legacy 3 digits', () => {
    expect(positionIdPart('7')).toBe('007');
    expect(positionIdPart('012')).toBe('012');
  });
  it('cleans alphanumeric labels', () => {
    expect(positionIdPart('1N')).toBe('1N');
    expect(positionIdPart('north end')).toBe('NORTHEND');
    expect(positionIdPart('  ')).toBe('X');
  });
});

describe('rowIdPart', () => {
  it('pads numeric rows to the legacy 2 digits', () => {
    expect(rowIdPart('1')).toBe('01');
  });
  it('dashes out spaces and punctuation', () => {
    expect(rowIdPart('North side')).toBe('North-side');
    expect(rowIdPart('Espalier')).toBe('Espalier');
  });
});
