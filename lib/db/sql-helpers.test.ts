import { describe, it, expect } from 'vitest';
import { buildUpdateSet, UnknownColumnError } from './sql-helpers';

const ALLOWED = ['variety', 'status', 'notes'] as const;

describe('buildUpdateSet', () => {
  it('builds a parameterized SET clause for allowed columns', () => {
    const result = buildUpdateSet({ variety: 'Fuji', status: 'healthy' }, ALLOWED);
    expect(result).not.toBeNull();
    expect(result!.setClause).toBe('variety = $1, status = $2');
    expect(result!.values).toEqual(['Fuji', 'healthy']);
  });

  it('skips undefined values', () => {
    const result = buildUpdateSet({ variety: undefined, notes: 'hi' }, ALLOWED);
    expect(result!.setClause).toBe('notes = $1');
    expect(result!.values).toEqual(['hi']);
  });

  it('returns null when nothing remains to update', () => {
    expect(buildUpdateSet({}, ALLOWED)).toBeNull();
    expect(buildUpdateSet({ variety: undefined }, ALLOWED)).toBeNull();
  });

  it('rejects unknown columns instead of interpolating them', () => {
    expect(() => buildUpdateSet({ 'notes = $1; DROP TABLE trees; --': 'x' }, ALLOWED))
      .toThrow(UnknownColumnError);
    expect(() => buildUpdateSet({ variety: 'ok', evil: 'x' }, ALLOWED))
      .toThrow(/evil/);
  });

  it('keeps null as an explicit value (clears a field)', () => {
    const result = buildUpdateSet({ notes: null }, ALLOWED);
    expect(result!.setClause).toBe('notes = $1');
    expect(result!.values).toEqual([null]);
  });
});
