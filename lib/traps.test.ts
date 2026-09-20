import { describe, it, expect } from 'vitest';
import { TRAP_TARGET, TRAP_TYPES, isTrapType, nextTrapLabel } from './traps';

describe('trap vocabulary', () => {
  it('recognises only real trap types', () => {
    expect(isTrapType('red_sphere')).toBe(true);
    expect(isTrapType('redsphere')).toBe(false);
    expect(isTrapType('')).toBe(false);
  });

  it('points every trap type at a pest the library covers', () => {
    // A trap whose target has no library entry would render a dead link
    // on the traps page.
    const LIBRARY_KEYS = [
      'apple_maggot',
      'codling_moth',
      'leafrollers',
      'rosy_apple_aphid',
    ];
    for (const t of TRAP_TYPES) {
      expect(LIBRARY_KEYS).toContain(TRAP_TARGET[t]);
    }
  });
});

describe('nextTrapLabel', () => {
  it('counts a trailing number up', () => {
    expect(nextTrapLabel('Sphere 1')).toBe('Sphere 2');
    expect(nextTrapLabel('Sphere 9')).toBe('Sphere 10');
    expect(nextTrapLabel('CM 09')).toBe('CM 10');
  });

  it('keeps a suffix after the number', () => {
    expect(nextTrapLabel('Trap 3 (north)')).toBe('Trap 4 (north)');
  });

  it('counts the LAST number, not the first', () => {
    expect(nextTrapLabel('Row 4 sphere 2')).toBe('Row 4 sphere 3');
  });

  it('leaves a name with no number alone rather than guessing', () => {
    expect(nextTrapLabel('By the hawthorn')).toBe('By the hawthorn');
    expect(nextTrapLabel('')).toBe('');
  });
});
