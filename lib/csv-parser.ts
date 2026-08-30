/**
 * CSV Parser Utilities for Tree Data Import
 *
 * CSV only: the xlsx package was removed for unpatched security advisories.
 * Export a CSV from Excel/Sheets/QGIS instead.
 *
 * Headers are matched case-insensitively through an alias table, so
 * "Latitude", "lat" and "y" all land on `lat`.
 */

export interface TreeImportRow {
  row_id: string;
  position: number;
  lat?: number;
  lng?: number;
  name?: string;
  variety?: string;
  status?: 'healthy' | 'stressed' | 'dead' | 'unknown';
  planted_date?: string;
  block_id?: string;
  age?: number;
  height?: number;
  last_pruned?: string;
  last_harvest?: string;
  yield_estimate?: number;
  notes?: string;
}

export interface ParseResult {
  success: boolean;
  data: TreeImportRow[];
  errors: string[];
  warnings: string[];
  rowCount: number;
}

/** Canonical field for each accepted header spelling (lowercased). */
const HEADER_ALIASES: Record<string, keyof TreeImportRow> = {
  row_id: 'row_id',
  row: 'row_id',
  'row id': 'row_id',
  position: 'position',
  pos: 'position',
  lat: 'lat',
  latitude: 'lat',
  y: 'lat',
  lng: 'lng',
  lon: 'lng',
  long: 'lng',
  longitude: 'lng',
  x: 'lng',
  name: 'name',
  variety: 'variety',
  cultivar: 'variety',
  status: 'status',
  health: 'status',
  planted_date: 'planted_date',
  planted: 'planted_date',
  'plant date': 'planted_date',
  block_id: 'block_id',
  block: 'block_id',
  age: 'age',
  height: 'height',
  last_pruned: 'last_pruned',
  pruned: 'last_pruned',
  last_harvest: 'last_harvest',
  harvest: 'last_harvest',
  yield_estimate: 'yield_estimate',
  yield: 'yield_estimate',
  notes: 'notes',
  note: 'notes',
  comments: 'notes',
};

const VALID_STATUSES = ['healthy', 'stressed', 'dead', 'unknown'] as const;

/**
 * Parse a tree CSV file into import rows.
 */
export async function parseTreeCSV(file: File): Promise<ParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data: TreeImportRow[] = [];

  const fail = (msg: string): ParseResult => ({
    success: false,
    data: [],
    errors: [msg],
    warnings: [],
    rowCount: 0,
  });

  if (/\.(xlsx|xls)$/i.test(file.name)) {
    return fail('Excel files are not supported. Please export your sheet as CSV and upload that instead.');
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return fail('Could not read the file.');
  }

  // Strip BOM, normalize line endings
  text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length < 2) {
    return fail('File must contain a header row and at least one data row.');
  }

  // Map headers through the alias table
  const rawHeaders = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  const headers: (keyof TreeImportRow | null)[] = rawHeaders.map((h) => HEADER_ALIASES[h] ?? null);
  const unknown = rawHeaders.filter((h, i) => h && headers[i] === null);
  if (unknown.length > 0) {
    warnings.push(`Ignored unrecognized column(s): ${unknown.join(', ')}`);
  }
  if (!headers.includes('row_id')) errors.push('Missing required column: row_id (or "row")');
  if (!headers.includes('position')) errors.push('Missing required column: position (or "pos")');
  if (errors.length > 0) {
    return { success: false, data: [], errors, warnings, rowCount: 0 };
  }

  const hasCoords = headers.includes('lat') && headers.includes('lng');
  if (!hasCoords) {
    warnings.push(
      'No lat/lng columns found — imported trees will be data records only and will not appear on the map until placed.'
    );
  }

  const numberField = (
    raw: string | undefined,
    field: string,
    lineNo: number,
    opts: { min?: number; max?: number } = {}
  ): number | undefined => {
    if (raw === undefined || raw === '') return undefined;
    const n = parseFloat(raw);
    if (Number.isNaN(n) || (opts.min !== undefined && n < opts.min) || (opts.max !== undefined && n > opts.max)) {
      errors.push(`Row ${lineNo}: invalid ${field} "${raw}"`);
      return undefined;
    }
    return n;
  };

  const dateField = (raw: string | undefined, field: string, lineNo: number): string | undefined => {
    if (!raw) return undefined;
    if (!isValidDate(raw)) {
      errors.push(`Row ${lineNo}: invalid ${field} "${raw}" (use YYYY-MM-DD)`);
      return undefined;
    }
    return raw;
  };

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    const values = parseCSVLine(lines[i]);
    const raw: Partial<Record<keyof TreeImportRow, string>> = {};
    headers.forEach((field, idx) => {
      if (field && values[idx] !== undefined) raw[field] = values[idx].trim();
    });

    const row_id = raw.row_id?.toString() ?? '';
    const position = parseInt(raw.position ?? '', 10);
    if (!row_id) {
      errors.push(`Row ${lineNo}: missing row_id`);
      continue;
    }
    if (!position || position < 1) {
      errors.push(`Row ${lineNo}: position must be a positive number`);
      continue;
    }

    const tree: TreeImportRow = { row_id, position };

    tree.lat = numberField(raw.lat, 'lat', lineNo, { min: -90, max: 90 });
    tree.lng = numberField(raw.lng, 'lng', lineNo, { min: -180, max: 180 });
    if ((tree.lat === undefined) !== (tree.lng === undefined)) {
      errors.push(`Row ${lineNo}: lat and lng must both be provided (or neither)`);
      tree.lat = undefined;
      tree.lng = undefined;
    }

    if (raw.name) tree.name = raw.name;
    if (raw.variety) tree.variety = raw.variety;
    if (raw.block_id) tree.block_id = raw.block_id;
    if (raw.notes) tree.notes = raw.notes;

    if (raw.status) {
      const status = raw.status.toLowerCase();
      if ((VALID_STATUSES as readonly string[]).includes(status)) {
        tree.status = status as TreeImportRow['status'];
      } else {
        errors.push(`Row ${lineNo}: invalid status "${raw.status}" (healthy, stressed, dead, or unknown)`);
      }
    }

    tree.planted_date = dateField(raw.planted_date, 'planted_date', lineNo);
    tree.last_pruned = dateField(raw.last_pruned, 'last_pruned', lineNo);
    tree.last_harvest = dateField(raw.last_harvest, 'last_harvest', lineNo);
    tree.age = numberField(raw.age, 'age', lineNo, { min: 0 });
    tree.height = numberField(raw.height, 'height', lineNo, { min: 0 });
    tree.yield_estimate = numberField(raw.yield_estimate, 'yield_estimate', lineNo, { min: 0 });

    data.push(tree);
  }

  return {
    success: data.length > 0 && errors.length === 0,
    data,
    errors,
    warnings,
    rowCount: data.length,
  };
}

/**
 * Parse a single CSV line, handling quoted values and escaped quotes ("").
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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
    'lat',
    'lng',
    'variety',
    'status',
    'planted_date',
    'age',
    'last_pruned',
    'last_harvest',
    'yield_estimate',
    'notes',
  ];

  const sampleRows = [
    ['1', '1', '48.11412', '-123.26440', 'Fuji', 'healthy', '2020-03-15', '4', '2024-01-10', '2023-10-15', '45.5', 'Strong growth this year'],
    ['1', '2', '48.11412', '-123.26432', 'Gala', 'stressed', '2020-03-15', '4', '2024-01-10', '2023-10-12', '32.0', 'Possible pest damage'],
    ['2', '1', '48.11405', '-123.26440', 'Honeycrisp', 'healthy', '2019-04-20', '5', '2024-01-08', '2023-10-20', '52.3', 'Excellent fruit quality'],
  ];

  const csvContent = [
    headers.join(','),
    ...sampleRows.map((row) => row.join(',')),
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
