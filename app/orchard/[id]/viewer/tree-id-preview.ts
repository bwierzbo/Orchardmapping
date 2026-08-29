/**
 * Client-side preview of the server's tree id scheme
 * (lib/db/trees.ts generateTreeId — keep in sync).
 */
export function generateTreeIdPreview(orchardId: string, rowId: string, position: number): string {
  const trimmed = String(rowId).trim();
  const normalized = /^\d+$/.test(trimmed) ? String(parseInt(trimmed, 10)) : trimmed;
  const row = (normalized || '?').padStart(2, '0');
  const pos = String(position).padStart(3, '0');
  return `${orchardId}-R${row}-P${pos}`;
}
