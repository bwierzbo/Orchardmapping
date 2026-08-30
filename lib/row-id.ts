/**
 * Client-safe row-id helpers, mirroring the server's scheme in
 * lib/db/trees.ts (keep in sync).
 */

/** Numeric rows lose leading zeros ("01" -> "1"); others pass through. */
export function normalizeRowId(rowId: string): string {
  const trimmed = String(rowId).trim();
  return /^\d+$/.test(trimmed) ? String(parseInt(trimmed, 10)) : trimmed;
}

/** Key identifying a physical planting spot within one orchard. */
export function rowPositionKey(rowId: string, position: number): string {
  return `${normalizeRowId(rowId)}::${position}`;
}

export function generateTreeIdPreview(orchardId: string, rowId: string, position: number): string {
  const row = (normalizeRowId(rowId) || '?').padStart(2, '0');
  const pos = String(position).padStart(3, '0');
  return `${orchardId}-R${row}-P${pos}`;
}
