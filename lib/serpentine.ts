import type { ClientTree } from './types';
import { normalizeRowId } from './row-id';

/**
 * Serpentine walk order: rows numerically ascending; odd row-indexes
 * reverse position order — matching how you physically survey an
 * orchard, up one row and down the next. Trees without a row/position
 * address are excluded (they can't be walked).
 */
export function serpentineOrder(trees: ClientTree[]): ClientTree[] {
  const byRow = new Map<string, ClientTree[]>();
  for (const t of trees) {
    if (!t.row_id || t.position == null) continue;
    const row = normalizeRowId(t.row_id);
    const list = byRow.get(row);
    if (list) list.push(t);
    else byRow.set(row, [t]);
  }
  const rows = [...byRow.keys()].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  const ordered: ClientTree[] = [];
  rows.forEach((row, i) => {
    const list = byRow.get(row)!;
    list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    if (i % 2 === 1) list.reverse();
    ordered.push(...list);
  });
  return ordered;
}
