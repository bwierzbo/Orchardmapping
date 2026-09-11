import { describe, it, expect } from 'vitest';
import { parseTreeCSV } from './csv-parser';

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

  it('reports rows with missing required fields', async () => {
    const result = await parseTreeCSV(csvFile('row_id,position,variety\n,1,Fuji\n'));
    expect(result.success).toBe(false);
  });
});
