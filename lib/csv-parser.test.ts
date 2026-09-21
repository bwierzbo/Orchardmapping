import { describe, it, expect } from 'vitest';
import { parseTreeCSV, generateTreesCSV } from './csv-parser';

function csvFile(content: string, name = 'trees.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

describe('parseTreeCSV', () => {
  it('parses a simple CSV with headers', async () => {
    const result = await parseTreeCSV(
      csvFile('row_id,position,variety,status\n1,1,Fuji,healthy\n1,2,Gala,stressed\n')
    );
    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(2);
    expect(result.data[0]).toMatchObject({ row_id: '1', position: '1', variety: 'Fuji' });
  });

  it('skips empty lines', async () => {
    const result = await parseTreeCSV(csvFile('row_id,position\n1,1\n\n1,2\n\n'));
    expect(result.rowCount).toBe(2);
  });

  it('rejects legacy .xls with a helpful message', async () => {
    const result = await parseTreeCSV(csvFile('irrelevant', 'trees.xls'));
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/\.xlsx/);
  });

  it('reports unreadable .xlsx content instead of throwing', async () => {
    const result = await parseTreeCSV(csvFile('not actually a workbook', 'trees.xlsx'));
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/Excel/);
  });

  it('rejects a row with nothing to match it on', async () => {
    const result = await parseTreeCSV(csvFile('tree_id,row_id,position,variety\n,,,Fuji\n'));
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/nothing to match on/);
  });

  it('rejects a file with no identifying column at all', async () => {
    const result = await parseTreeCSV(csvFile('variety,status\nFuji,healthy\n'));
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/identifying column/);
  });

  it('accepts a partial address: part of an orchard may have no rows', async () => {
    const result = await parseTreeCSV(csvFile('block,position,variety\nUpper,5,Fuji\n'));
    expect(result.success).toBe(true);
    expect(result.data[0]).toMatchObject({ block_id: 'Upper', position: '5' });
    expect(result.data[0].row_id).toBeUndefined();
  });
});

describe('generateTreesCSV', () => {
  it('emits import-compatible headers and escapes commas/quotes', async () => {
    const blob = generateTreesCSV([
      {
        row_id: '1',
        position: '2',
        variety: 'Cox, Orange "Pippin"',
        fruit_type: 'apple',
        status: 'healthy',
        notes: null,
      },
      // An unplaced tree still exports: its permanent id brings it back.
      { tree_id: 'OBC-001-0009', row_id: null, position: null, variety: 'not placed yet' },
      { variety: 'skipped — nothing to identify it by' },
    ]);
    const text = await blob.text();
    const [header, row, ...rest] = text.split('\n');
    expect(header.startsWith('tree_id,block_id,row_id,position,lat,lng,name,variety')).toBe(true);
    expect(row).toContain('"Cox, Orange ""Pippin"""');
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain('OBC-001-0009');

    // Round-trip: the export parses back through the importer
    const parsed = await parseTreeCSV(new File([text], 'roundtrip.csv', { type: 'text/csv' }));
    expect(parsed.success).toBe(true);
    expect(parsed.data[0]).toMatchObject({ row_id: '1', position: '2', fruit_type: 'apple' });
  });
});
