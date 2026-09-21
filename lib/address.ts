/**
 * A tree's address: block/section, row, position.
 *
 * Client-safe, and the single definition of what an address means. All
 * three parts are optional and independently editable -- a tree may sit in
 * a block with no rows, a row with no block, or nowhere yet. None of this
 * is identity: a tree's permanent id (OBC-001-0142) is issued once and
 * never derived from where the tree stands. See migration 049.
 */
import { normalizePosition } from './position';

/** An absent part is null, never '' -- "unplaced" has one representation. */
export function normalizeAddressPart(
  value: string | number | null | undefined
): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim().replace(/\s+/g, ' ');
  return trimmed === '' ? null : trimmed;
}

/** Numeric rows lose leading zeros ("01" -> "1"); others pass through. */
export function normalizeRowId(rowId: string): string {
  const trimmed = String(rowId).trim();
  return /^\d+$/.test(trimmed) ? String(parseInt(trimmed, 10)) : trimmed;
}

export interface TreeAddress {
  block_id?: string | null;
  row_id?: string | null;
  position?: string | null;
}

/** An address with each part in the exact form the database stores. */
export interface NormalizedAddress {
  block_id: string | null;
  row_id: string | null;
  position: string | null;
}

/**
 * Put an address in canonical form. Every write path runs through this, so
 * "01"/"1" and " Upper "/"Upper" cannot become two different spots.
 */
export function normalizeAddress(a: TreeAddress): NormalizedAddress {
  const block = normalizeAddressPart(a.block_id);
  const row = normalizeAddressPart(a.row_id);
  const position = normalizeAddressPart(a.position);
  return {
    block_id: block,
    row_id: row === null ? null : normalizeRowId(row),
    position: position === null ? null : normalizePosition(position),
  };
}

/** True when a tree has no address at all. */
export function isUnplaced(a: TreeAddress): boolean {
  const n = normalizeAddress(a);
  return n.block_id === null && n.row_id === null && n.position === null;
}

const SEP = '\u001f';

/**
 * Key identifying one physical spot within an orchard. Mirrors the
 * address_key generated column in the database exactly (migration 049), so
 * the client can warn about a collision before a save is attempted rather
 * than after the constraint rejects it. Null for an unplaced tree, which
 * is why any number of unplaced trees may coexist.
 */
export function addressKey(a: TreeAddress): string | null {
  const n = normalizeAddress(a);
  if (n.block_id === null && n.row_id === null && n.position === null) return null;
  return `${n.block_id ?? ''}${SEP}${n.row_id ?? ''}${SEP}${n.position ?? ''}`;
}

/** How an address reads in the UI: "Upper · R3 · P12", or "Unplaced". */
export function formatAddress(a: TreeAddress): string {
  const n = normalizeAddress(a);
  const parts = [
    n.block_id,
    n.row_id === null ? null : `R${n.row_id}`,
    n.position === null ? null : `P${n.position}`,
  ];
  const shown = parts.filter((p): p is string => p !== null);
  return shown.length > 0 ? shown.join(' · ') : 'Unplaced';
}

/** How a tree reads when it needs naming in full: "Tree 142 · R3 · P12". */
export function formatTreeLabel(tree: TreeAddress & { tree_no?: number | null }): string {
  const address = formatAddress(tree);
  return tree.tree_no == null ? address : `Tree ${tree.tree_no} · ${address}`;
}
