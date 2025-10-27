/**
 * Tree validation utilities for CSV imports and data validation
 */

export interface TreeRowData {
  row_id: string;
  position: number;
  variety?: string;
  status?: string;
  planted_date?: string;
  age?: number;
  height?: number;
  last_pruned?: string;
  last_harvest?: string;
  yield_estimate?: number;
  notes?: string;
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

  // Required fields
  if (!rowData.row_id || rowData.row_id.trim() === '') {
    errors.push({
      field: 'row_id',
      message: 'Row ID is required',
      row: rowNumber
    });
  }

  if (rowData.position === undefined || rowData.position === null) {
    errors.push({
      field: 'position',
      message: 'Position is required',
      row: rowNumber
    });
  } else if (typeof rowData.position !== 'number' || rowData.position < 1) {
    errors.push({
      field: 'position',
      message: 'Position must be a positive number',
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
 * Validates an entire bulk import dataset
 * Checks for duplicates within the dataset and against existing trees
 *
 * @param data - Array of tree data to validate
 * @param existingTrees - Optional array of existing trees to check for duplicates
 * @returns ValidationResult with all errors and warnings
 */
export function validateBulkImport(
  data: TreeRowData[],
  existingTrees?: Array<{ row_id: string; position: number }>
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  // Validate each row
  data.forEach((row, index) => {
    const rowValidation = validateTreeRow(row, index + 2); // +2 because row 1 is headers, index is 0-based
    errors.push(...rowValidation.errors);

    // Check for duplicates within the dataset
    const key = `${row.row_id}-${row.position}`;
    if (seen.has(key)) {
      errors.push({
        field: 'row_id/position',
        message: `Duplicate entry: Row ${row.row_id}, Position ${row.position}`,
        row: index + 2
      });
    } else {
      seen.add(key);
    }

    // Check against existing trees
    if (existingTrees) {
      const existingMatch = existingTrees.find(
        t => t.row_id === row.row_id && t.position === row.position
      );

      if (existingMatch) {
        warnings.push(
          `Row ${row.row_id}, Position ${row.position} already exists and will be updated`
        );
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

  const requiredColumns = ['row_id', 'position'];
  const missingColumns = requiredColumns.filter(col => !normalizedHeaders.includes(col));

  if (missingColumns.length > 0) {
    errors.push({
      field: 'headers',
      message: `Missing required columns: ${missingColumns.join(', ')}`
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
    row_id: rowData.row_id?.trim() || '',
    position: parseInt(rowData.position) || 0,
    variety: rowData.variety?.trim() || undefined,
    status: rowData.status?.toLowerCase().trim() || undefined,
    planted_date: rowData.planted_date?.trim() || undefined,
    age: rowData.age ? parseFloat(rowData.age) : undefined,
    height: rowData.height ? parseFloat(rowData.height) : undefined,
    last_pruned: rowData.last_pruned?.trim() || undefined,
    last_harvest: rowData.last_harvest?.trim() || undefined,
    yield_estimate: rowData.yield_estimate ? parseFloat(rowData.yield_estimate) : undefined,
    notes: rowData.notes?.trim() || undefined
  };
}
