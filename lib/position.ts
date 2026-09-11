/**
 * Alphanumeric tree-position helpers.
 *
 * Positions are free-form labels ("5", "1N", "2S", "A3") ordered with
 * numeric-aware comparison so "2" sorts before "10" and "1N" before
 * "2N". Numeric-only labels normalize like row ids (leading zeros
 * dropped) to keep "01" and "1" the same physical spot.
 */

export function normalizePosition(position: string | number): string {
  const trimmed = String(position).trim().replace(/\s+/g, ' ');
  return /^\d+$/.test(trimmed) ? String(parseInt(trimmed, 10)) : trimmed;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Natural compare: "2" < "10", "1N" < "2N", "A2" < "A10". */
export function comparePositions(a: string, b: string): number {
  return collator.compare(a, b);
}

/**
 * Advance the trailing number in a position label, preserving any
 * suffix and zero-padding: "5"→"6", "09"→"10", "1N"→"2N". Returns
 * null when the label has no digits to advance (auto-advance stops).
 */
export function nextPosition(position: string): string | null {
  const m = /^(.*?)(\d+)(\D*)$/.exec(position);
  if (!m) return null;
  const [, prefix, digits, suffix] = m;
  const next = String(parseInt(digits, 10) + 1).padStart(digits.length, '0');
  return `${prefix}${next}${suffix}`;
}

/**
 * Position fragment for tree ids. Pure numbers keep the legacy 3-digit
 * padding (P001); anything else strips non-alphanumerics ("1N"→"1N",
 * "north end"→"NORTHEND" stays readable in ids and URLs).
 */
export function positionIdPart(position: string): string {
  const norm = normalizePosition(position);
  if (/^\d+$/.test(norm)) return norm.padStart(3, '0');
  const cleaned = norm.replace(/[^A-Za-z0-9]+/g, '').toUpperCase();
  return cleaned || 'X';
}

/** Row/block fragment for tree ids: non-alphanumerics become dashes. */
export function rowIdPart(rowId: string): string {
  const cleaned = rowId
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const padded = /^\d+$/.test(cleaned) ? cleaned.padStart(2, '0') : cleaned;
  return padded || 'X';
}
