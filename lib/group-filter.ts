import type { ClientTree } from './types';
import { normalizeRowId } from './row-id';

/**
 * A composable tree filter — dimensions AND together; within one
 * dimension, values OR together. Empty dimension = no constraint
 * (so an empty filter selects the whole orchard).
 */
export interface GroupFilter {
  rows?: string[];
  varieties?: string[];
  statuses?: string[];
  blocks?: string[];
}

export function matchesFilter(tree: ClientTree, filter: GroupFilter): boolean {
  if (filter.rows?.length) {
    const row = tree.row_id ? normalizeRowId(tree.row_id) : null;
    if (!row || !filter.rows.map(normalizeRowId).includes(row)) return false;
  }
  if (filter.varieties?.length) {
    if (!tree.variety || !filter.varieties.includes(tree.variety)) return false;
  }
  if (filter.statuses?.length) {
    if (!filter.statuses.includes(tree.status)) return false;
  }
  if (filter.blocks?.length) {
    if (!tree.block_id || !filter.blocks.includes(tree.block_id)) return false;
  }
  return true;
}

export function filterTrees(trees: ClientTree[], filter: GroupFilter): ClientTree[] {
  return trees.filter((t) => matchesFilter(t, filter));
}

/** Human summary of a filter for the group-action record and undo list. */
export function describeFilter(filter: GroupFilter): string {
  const parts: string[] = [];
  if (filter.rows?.length) parts.push(`rows ${filter.rows.join(', ')}`);
  if (filter.varieties?.length) parts.push(filter.varieties.join(', '));
  if (filter.statuses?.length) parts.push(`status: ${filter.statuses.join('/')}`);
  if (filter.blocks?.length) parts.push(`blocks ${filter.blocks.join(', ')}`);
  return parts.length ? parts.join(' · ') : 'whole orchard';
}
