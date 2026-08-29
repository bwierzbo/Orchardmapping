import { describe, it, expect } from 'vitest';
import {
  validateTreeRow,
  validateTreeUpdate,
  validateBulkImport,
  TreeRowData,
} from './tree-validation';

describe('validateTreeRow', () => {
  it('accepts a minimal valid row', () => {
    const result = validateTreeRow({ row_id: '1', position: 1 });
    expect(result.isValid).toBe(true);
  });

  it('requires row_id and positive position', () => {
    expect(validateTreeRow({ row_id: '', position: 1 }).isValid).toBe(false);
    expect(validateTreeRow({ row_id: '1', position: 0 }).isValid).toBe(false);
  });

  it('rejects unknown status and bad dates', () => {
    expect(validateTreeRow({ row_id: '1', position: 1, status: 'sick' }).isValid).toBe(false);
    expect(validateTreeRow({ row_id: '1', position: 1, planted_date: '03/01/2020' }).isValid).toBe(false);
    expect(validateTreeRow({ row_id: '1', position: 1, planted_date: '2020-03-01' }).isValid).toBe(true);
  });

  it('rejects negative numerics', () => {
    expect(validateTreeRow({ row_id: '1', position: 1, age: -1 }).isValid).toBe(false);
    expect(validateTreeRow({ row_id: '1', position: 1, height: -2 }).isValid).toBe(false);
  });
});

describe('validateTreeUpdate', () => {
  it('does not require row_id/position', () => {
    expect(validateTreeUpdate({ status: 'healthy' }).isValid).toBe(true);
  });

  it('still validates provided fields', () => {
    expect(validateTreeUpdate({ status: 'sick' }).isValid).toBe(false);
    expect(validateTreeUpdate({ planted_date: 'nope' }).isValid).toBe(false);
    expect(validateTreeUpdate({ position: -3 }).isValid).toBe(false);
  });
});

describe('validateBulkImport', () => {
  it('flags duplicates within the dataset', () => {
    const rows: TreeRowData[] = [
      { row_id: '1', position: 1 },
      { row_id: '1', position: 1 },
    ];
    const result = validateBulkImport(rows);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
  });

  it('passes distinct valid rows', () => {
    const rows: TreeRowData[] = [
      { row_id: '1', position: 1, status: 'healthy' },
      { row_id: '1', position: 2, status: 'stressed' },
    ];
    expect(validateBulkImport(rows).isValid).toBe(true);
  });
});
