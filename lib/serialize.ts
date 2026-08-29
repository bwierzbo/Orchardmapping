import type { Tree } from './db/trees';
import { asTreeStatus, type ClientTree } from './types';
import { toYMD } from './dates';

/**
 * Convert a DB Tree row into the client-facing shape: DATE columns as
 * 'YYYY-MM-DD', timestamps as ISO strings, status narrowed to the enum.
 */
export function serializeTree(tree: Tree): ClientTree {
  return {
    id: tree.id,
    tree_id: tree.tree_id,
    orchard_id: tree.orchard_id,
    name: tree.name ?? null,
    variety: tree.variety ?? null,
    status: asTreeStatus(tree.status),
    planted_date: toYMD(tree.planted_date),
    block_id: tree.block_id ?? null,
    row_id: tree.row_id ?? null,
    position: tree.position ?? null,
    age: tree.age ?? null,
    height: tree.height ?? null,
    lat: tree.lat ?? null,
    lng: tree.lng ?? null,
    last_pruned: toYMD(tree.last_pruned),
    last_harvest: toYMD(tree.last_harvest),
    yield_estimate: tree.yield_estimate ?? null,
    notes: tree.notes ?? null,
    created_at: tree.created_at ? new Date(tree.created_at).toISOString() : null,
    updated_at: tree.updated_at ? new Date(tree.updated_at).toISOString() : null,
  };
}
