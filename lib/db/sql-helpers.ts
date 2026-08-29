/**
 * Helpers for building dynamic-but-safe SQL fragments.
 *
 * Column names must NEVER come from request data. Every dynamic UPDATE
 * goes through buildUpdateSet with an explicit column whitelist; unknown
 * keys are rejected rather than silently dropped so callers surface bad
 * input as a 400 instead of writing a partial update.
 */

export class UnknownColumnError extends Error {
  constructor(public readonly columns: string[]) {
    super(`Unknown column(s): ${columns.join(', ')}`);
    this.name = 'UnknownColumnError';
  }
}

export interface UpdateSet {
  /** e.g. "variety = $1, status = $2" */
  setClause: string;
  /** parameter values matching the $n placeholders, in order */
  values: unknown[];
}

/**
 * Build a parameterized SET clause from a data object.
 *
 * - Keys not in `allowed` throw UnknownColumnError.
 * - `undefined` values are skipped (field not being updated).
 * - Returns null when nothing remains to update.
 */
export function buildUpdateSet(
  data: Record<string, unknown>,
  allowed: readonly string[]
): UpdateSet | null {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);

  const unknown = entries.map(([k]) => k).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    throw new UnknownColumnError(unknown);
  }

  if (entries.length === 0) return null;

  const setClause = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
  const values = entries.map(([, v]) => v);
  return { setClause, values };
}
