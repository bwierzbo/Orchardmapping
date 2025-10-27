/**
 * CSV/Excel Parser Utilities for Tree Data Import
 */

import * as XLSX from 'xlsx';

export interface TreeImportRow {
  row_id: string;
  position: number;
  variety?: string;
  status?: 'healthy' | 'stressed' | 'dead' | 'unknown';
  planted_date?: string;
  age?: number;
  last_pruned?: string;
  last_harvest?: string;
  yield_estimate?: number;
  notes?: string;
}

export interface ParseResult {
  success: boolean;
  data: TreeImportRow[];
  errors: string[];
  rowCount: number;
}

/**
 * Parse CSV or Excel file to tree import data
 */
export async function parseTreeCSV(file: File): Promise<ParseResult> {
  const errors: string[] = [];
  const data: TreeImportRow[] = [];

  try {
    let rows: any[] = [];
    let headers: string[] = [];

    // Detect file type and parse accordingly
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      // Parse Excel file
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON with header row
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length < 2) {
        return {
          success: false,
          data: [],
          errors: ['File must contain at least a header row and one data row'],
          rowCount: 0
        };
      }

      // First row is headers
      headers = (jsonData[0] as any[]).map(h => String(h || '').trim().toLowerCase());

      // Convert remaining rows to objects
      for (let i = 1; i < jsonData.length; i++) {
        const rowArray = jsonData[i] as any[];
        if (!rowArray || rowArray.every(cell => cell === undefined || cell === null || cell === '')) {
          continue; // Skip empty rows
        }

        const rowObj: any = {};
        headers.forEach((header, index) => {
          if (rowArray[index] !== undefined && rowArray[index] !== null && rowArray[index] !== '') {
            rowObj[header] = String(rowArray[index]).trim();
          }
        });
        rows.push(rowObj);
      }
    } else {
      // Parse CSV file
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        return {
          success: false,
          data: [],
          errors: ['File must contain at least a header row and one data row'],
          rowCount: 0
        };
      }

      // Parse header
      headers = lines[0].split(',').map(h => h.trim().toLowerCase());

      // Parse data rows
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = parseCSVLine(line);
        const row: any = {};

        headers.forEach((header, index) => {
          if (values[index] !== undefined) {
            row[header] = values[index].trim();
          }
        });
        rows.push(row);
      }
    }

    // Validate required columns
    if (!headers.includes('row_id')) {
      errors.push('Missing required column: row_id');
    }
    if (!headers.includes('position')) {
      errors.push('Missing required column: position');
    }

    if (errors.length > 0) {
      return { success: false, data: [], errors, rowCount: 0 };
    }

    // Process rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Validate and convert types
      try {
        const treeRow: TreeImportRow = {
          row_id: row.row_id?.toString() || '',
          position: parseInt(row.position) || 0,
        };

        // Validate required fields
        if (!treeRow.row_id) {
          errors.push(`Row ${i + 2}: Missing row_id`);
          continue;
        }
        if (!treeRow.position || treeRow.position < 1) {
          errors.push(`Row ${i + 2}: Invalid position (must be positive number)`);
          continue;
        }

        // Optional fields
        if (row.variety) treeRow.variety = row.variety;

        if (row.status) {
          const status = row.status.toLowerCase();
          if (['healthy', 'stressed', 'dead', 'unknown'].includes(status)) {
            treeRow.status = status as any;
          } else {
            errors.push(`Row ${i + 2}: Invalid status "${row.status}" (must be: healthy, stressed, dead, or unknown)`);
          }
        }

        if (row.planted_date) {
          if (isValidDate(row.planted_date)) {
            treeRow.planted_date = row.planted_date;
          } else {
            errors.push(`Row ${i + 2}: Invalid planted_date format (use YYYY-MM-DD)`);
          }
        }

        if (row.age) {
          const age = parseFloat(row.age);
          if (!isNaN(age) && age >= 0) {
            treeRow.age = age;
          } else {
            errors.push(`Row ${i + 2}: Invalid age (must be positive number)`);
          }
        }

        if (row.last_pruned) {
          if (isValidDate(row.last_pruned)) {
            treeRow.last_pruned = row.last_pruned;
          } else {
            errors.push(`Row ${i + 2}: Invalid last_pruned format (use YYYY-MM-DD)`);
          }
        }

        if (row.last_harvest) {
          if (isValidDate(row.last_harvest)) {
            treeRow.last_harvest = row.last_harvest;
          } else {
            errors.push(`Row ${i + 2}: Invalid last_harvest format (use YYYY-MM-DD)`);
          }
        }

        if (row.yield_estimate) {
          const yieldEst = parseFloat(row.yield_estimate);
          if (!isNaN(yieldEst) && yieldEst >= 0) {
            treeRow.yield_estimate = yieldEst;
          } else {
            errors.push(`Row ${i + 2}: Invalid yield_estimate (must be positive number)`);
          }
        }

        if (row.notes) treeRow.notes = row.notes;

        data.push(treeRow);
      } catch (err: any) {
        errors.push(`Row ${i + 2}: ${err.message}`);
      }
    }

    return {
      success: data.length > 0,
      data,
      errors,
      rowCount: data.length
    };
  } catch (err: any) {
    return {
      success: false,
      data: [],
      errors: [`Failed to parse file: ${err.message}`],
      rowCount: 0
    };
  }
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

/**
 * Validate date string in YYYY-MM-DD format
 */
function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Generate a sample CSV template for download
 */
export function generateTemplateCSV(): Blob {
  const headers = [
    'row_id',
    'position',
    'variety',
    'status',
    'planted_date',
    'age',
    'last_pruned',
    'last_harvest',
    'yield_estimate',
    'notes'
  ];

  const sampleRows = [
    ['1', '1', 'Fuji', 'healthy', '2020-03-15', '4', '2024-01-10', '2023-10-15', '45.5', 'Strong growth this year'],
    ['1', '2', 'Gala', 'stressed', '2020-03-15', '4', '2024-01-10', '2023-10-12', '32.0', 'Possible pest damage'],
    ['2', '1', 'Honeycrisp', 'healthy', '2019-04-20', '5', '2024-01-08', '2023-10-20', '52.3', 'Excellent fruit quality']
  ];

  const csvContent = [
    headers.join(','),
    ...sampleRows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
