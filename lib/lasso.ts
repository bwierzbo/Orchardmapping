import { pointInRing } from './tree-detect';
import type { ClientTree } from './types';

/** A freehand trace, as [lng, lat] pairs in the order they were drawn. */
export type Ring = [number, number][];

export type LassoMode = 'replace' | 'add' | 'subtract';

/**
 * The trees inside a freehand shape.
 *
 * Done against the trees already in memory rather than by asking the map
 * what it rendered: below the clustering zoom the map returns clusters
 * instead of trees, so a query-based hit test would silently miss most of
 * a selection when zoomed out. A tree with no coordinates cannot be
 * circled and is never included.
 */
export function treesInRing(trees: readonly ClientTree[], ring: Ring): ClientTree[] {
  if (ring.length < 3) return [];
  return trees.filter(
    (t) => t.lat != null && t.lng != null && pointInRing(t.lng, t.lat, ring)
  );
}

/** Fold a new trace into the existing selection. */
export function applyLasso(
  current: ReadonlySet<string>,
  hits: readonly ClientTree[],
  mode: LassoMode
): Set<string> {
  const ids = hits.map((t) => t.tree_id);
  if (mode === 'replace') return new Set(ids);
  const next = new Set(current);
  for (const id of ids) {
    if (mode === 'add') next.add(id);
    else next.delete(id);
  }
  return next;
}
