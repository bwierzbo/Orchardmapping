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

  it('no longer requires an address: a tree may be recorded before it is placed', () => {
    expect(validateTreeRow({}).isValid).toBe(true);
    expect(validateTreeRow({ row_id: '', position: 1 }).isValid).toBe(true);
    expect(validateTreeRow({ row_id: '1', position: '' }).isValid).toBe(true);
    expect(validateTreeRow({ block_id: 'Upper' }).isValid).toBe(true);
  });

  it('still rejects a position label it could not store or show', () => {
    expect(validateTreeRow({ row_id: '1', position: '!!' }).isValid).toBe(false);
    expect(validateTreeRow({ row_id: '1', position: 'x'.repeat(21) }).isValid).toBe(false);
    // Alphanumeric labels are the point of the change
    expect(validateTreeRow({ row_id: 'Espalier', position: '1N' }).isValid).toBe(true);
    expect(validateTreeRow({ row_id: 'North side', position: 'A3' }).isValid).toBe(true);
    // Over-long block and row labels are rejected the same way
    expect(validateTreeRow({ block_id: 'x'.repeat(51), position: '1' }).isValid).toBe(false);
    expect(validateTreeRow({ row_id: 'x'.repeat(51), position: '1' }).isValid).toBe(false);
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
