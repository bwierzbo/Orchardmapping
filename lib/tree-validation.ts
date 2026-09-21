/**
 * Tree validation utilities for CSV imports and data validation
 */
import { addressKey, formatAddress, type TreeAddress } from './address';

export interface TreeRowData {
  /** Permanent id, when a row is updating a tree that already exists. */
  tree_id?: string;
  /** Every part of the address is optional; a tree may be unplaced. */
  row_id?: string | null;
  /** Free-form alphanumeric label: "5", "1N", "A3", … */
  position?: string | number | null;
  lat?: number;
  lng?: number;
  name?: string;
  block_id?: string;
  variety?: string;
  fruit_type?: string;
  status?: string;
  planted_date?: string;
  age?: number;
  height?: number;
  last_pruned?: string;
  last_harvest?: string;
  yield_estimate?: number;
  notes?: string;
  rootstock?: string;
  source?: string;
  acquired_date?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  row?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: string[];
}

/**
 * Valid status values for trees
 */
const VALID_STATUSES = ['healthy', 'stressed', 'dead', 'unknown'];

/**
 * Validates a date string in YYYY-MM-DD format
 */
function isValidDate(dateString: string): boolean {
  if (!dateString) return true; // Optional field

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Validates a single tree row from CSV import
 *
 * @param rowData - The tree data to validate
 * @param rowNumber - Optional row number for error reporting
 * @returns ValidationResult with errors if any
 */
export function validateTreeRow(
  rowData: TreeRowData,
  rowNumber?: number
): ValidationResult {
  const errors: ValidationError[] = [];

  // No part of the address is required -- a tree may be recorded before it
  // is placed -- but a part that IS given has to be usable as a label.
  const rowStr = rowData.row_id == null ? '' : String(rowData.row_id).trim();
  if (rowStr.length > 50) {
    errors.push({
      field: 'row_id',
      message: 'Row must be 50 characters or fewer',
      row: rowNumber
    });
  }

  const blockStr = rowData.block_id == null ? '' : String(rowData.block_id).trim();
  if (blockStr.length > 50) {
    errors.push({
      field: 'block_id',
      message: 'Block must be 50 characters or fewer',
      row: rowNumber
    });
  }

  const positionStr =
    rowData.position === undefined || rowData.position === null
      ? ''
      : String(rowData.position).trim();
  if (positionStr !== '' && (positionStr.length > 20 || !/^[A-Za-z0-9][A-Za-z0-9 ._\-\/]*$/.test(positionStr))) {
    errors.push({
      field: 'position',
      message:
        'Position must be alphanumeric (letters, numbers, spaces, . _ - /), up to 20 characters',
      row: rowNumber
    });
  }

  // Status validation
  if (rowData.status) {
    const normalizedStatus = rowData.status.toLowerCase().trim();
    if (!VALID_STATUSES.includes(normalizedStatus)) {
      errors.push({
        field: 'status',
        message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        row: rowNumber
      });
    }
  }

  // Date validations
  if (rowData.planted_date && !isValidDate(rowData.planted_date)) {
    errors.push({
      field: 'planted_date',
      message: 'Invalid date format. Use YYYY-MM-DD',
      row: rowNumber
    });
  }

  if (rowData.acquired_date && !isValidDate(rowData.acquired_date)) {
    errors.push({
      field: 'acquired_date',
      message: 'Invalid date format. Use YYYY-MM-DD',
      row: rowNumber
    });
  }

  if (rowData.last_pruned && !isValidDate(rowData.last_pruned)) {
    errors.push({
      field: 'last_pruned',
      message: 'Invalid date format. Use YYYY-MM-DD',
      row: rowNumber
    });
  }

  if (rowData.last_harvest && !isValidDate(rowData.last_harvest)) {
    errors.push({
      field: 'last_harvest',
      message: 'Invalid date format. Use YYYY-MM-DD',
      row: rowNumber
    });
  }

  // Coordinate validations
  if (rowData.lat !== undefined && rowData.lat !== null) {
    if (typeof rowData.lat !== 'number' || rowData.lat < -90 || rowData.lat > 90) {
      errors.push({ field: 'lat', message: 'Latitude must be between -90 and 90', row: rowNumber });
    }
  }
  if (rowData.lng !== undefined && rowData.lng !== null) {
    if (typeof rowData.lng !== 'number' || rowData.lng < -180 || rowData.lng > 180) {
      errors.push({ field: 'lng', message: 'Longitude must be between -180 and 180', row: rowNumber });
    }
  }

  // Numeric validations
  if (rowData.age !== undefined && rowData.age !== null) {
    if (typeof rowData.age !== 'number' || rowData.age < 0) {
      errors.push({
        field: 'age',
        message: 'Age must be a non-negative number',
        row: rowNumber
      });
    }
  }

  if (rowData.height !== undefined && rowData.height !== null) {
    if (typeof rowData.height !== 'number' || rowData.height < 0) {
      errors.push({
        field: 'height',
        message: 'Height must be a non-negative number',
        row: rowNumber
      });
    }
  }

  if (rowData.yield_estimate !== undefined && rowData.yield_estimate !== null) {
    if (typeof rowData.yield_estimate !== 'number' || rowData.yield_estimate < 0) {
      errors.push({
        field: 'yield_estimate',
        message: 'Yield estimate must be a non-negative number',
        row: rowNumber
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates a partial tree update (PUT payload). Identical to
 * validateTreeRow now that no field is mandatory.
 */
export function validateTreeUpdate(fields: Partial<TreeRowData>): ValidationResult {
  return validateTreeRow(fields as TreeRowData);
}

/**
 * Validates an entire bulk import dataset
 * Checks for duplicates within the dataset and against existing trees
 *
 * @param data - Array of tree data to validate
 * @param existingTrees - Optional array of existing trees to check for duplicates
 * @returns ValidationResult with all errors and warnings
 */
export function validateBulkImport(
  data: TreeRowData[],
  existingTrees?: Array<TreeAddress>
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  // Validate each row
  data.forEach((row, index) => {
    const rowValidation = validateTreeRow(row, index + 2); // +2 because row 1 is headers, index is 0-based
    errors.push(...rowValidation.errors);

    // Two rows cannot claim one spot. Unplaced rows are exempt: any number
    // of trees may be waiting to be placed.
    const key = addressKey(row as TreeAddress);
    if (key) {
      if (seen.has(key)) {
        errors.push({
          field: 'address',
          message: `Duplicate entry: ${formatAddress(row as TreeAddress)}`,
          row: index + 2
        });
      } else {
        seen.add(key);
      }

      if (existingTrees?.some((t) => addressKey(t) === key)) {
        warnings.push(`${formatAddress(row as TreeAddress)} already exists and will be updated`);
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Formats validation errors into user-friendly messages
 *
 * @param errors - Array of validation errors
 * @returns Array of formatted error messages
 */
export function formatValidationErrors(errors: ValidationError[]): string[] {
  return errors.map(error => {
    const rowPrefix = error.row ? `Row ${error.row}: ` : '';
    const fieldInfo = error.field ? `[${error.field}] ` : '';
    return `${rowPrefix}${fieldInfo}${error.message}`;
  });
}

/**
 * Validates required columns in CSV header
 *
 * @param headers - Array of column headers from CSV
 * @returns ValidationResult indicating if required columns are present
 */
export function validateCSVHeaders(headers: string[]): ValidationResult {
  const errors: ValidationError[] = [];
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

  // A file needs some way to say which tree each row is about: a permanent
  // id, or an address to place it at. Everything else is optional.
  const identifying = ['tree_id', 'block_id', 'row_id', 'position'];
  if (!identifying.some((col) => normalizedHeaders.includes(col))) {
    errors.push({
      field: 'headers',
      message: `Needs a tree_id column, or an address column (${identifying.slice(1).join(', ')})`
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Sanitizes and normalizes tree row data
 * Converts strings to appropriate types and normalizes values
 *
 * @param rowData - Raw tree data from CSV
 * @returns Sanitized tree data
 */
export function sanitizeTreeRow(rowData: Record<string, string>): TreeRowData {
  return {
    tree_id: rowData.tree_id?.trim() || undefined,
    block_id: rowData.block_id?.trim() || undefined,
    row_id: rowData.row_id?.trim() || undefined,
    position: rowData.position?.trim() || undefined,
    variety: rowData.variety?.trim() || undefined,
    fruit_type: rowData.fruit_type?.trim().toLowerCase() || undefined,
    status: rowData.status?.toLowerCase().trim() || undefined,
    planted_date: rowData.planted_date?.trim() || undefined,
    age: rowData.age ? parseFloat(rowData.age) : undefined,
    height: rowData.height ? parseFloat(rowData.height) : undefined,
    last_pruned: rowData.last_pruned?.trim() || undefined,
    last_harvest: rowData.last_harvest?.trim() || undefined,
    yield_estimate: rowData.yield_estimate ? parseFloat(rowData.yield_estimate) : undefined,
    notes: rowData.notes?.trim() || undefined,
    rootstock: rowData.rootstock?.trim() || undefined,
    source: rowData.source?.trim() || undefined,
    acquired_date: rowData.acquired_date?.trim() || undefined
  };
}
