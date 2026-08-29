import type { ClientTree, TreeStatus } from './types';

/** Status colors shared by the map layer, legend chips, and badges. */
export const STATUS_COLORS: Record<TreeStatus, string> = {
  healthy: '#1F9D4D',
  stressed: '#DB9E00',
  dead: '#C0392B',
  unknown: '#7C8894',
};

export interface TreeFeatureProperties {
  tree_id: string;
  status: TreeStatus;
  variety: string;
  row_id: string;
  position: number;
}

/**
 * Build the GeoJSON FeatureCollection backing the tree layers.
 * feature.id is the numeric DB id so MapLibre feature-state works.
 */
export function treesToFeatureCollection(
  trees: ClientTree[],
  statusFilter?: ReadonlySet<TreeStatus>
): GeoJSON.FeatureCollection<GeoJSON.Point, TreeFeatureProperties> {
  const features: GeoJSON.Feature<GeoJSON.Point, TreeFeatureProperties>[] = [];
  for (const tree of trees) {
    if (tree.lat == null || tree.lng == null) continue;
    if (statusFilter && !statusFilter.has(tree.status)) continue;
    features.push({
      type: 'Feature',
      id: tree.id,
      geometry: { type: 'Point', coordinates: [tree.lng, tree.lat] },
      properties: {
        tree_id: tree.tree_id,
        status: tree.status,
        variety: tree.variety ?? '',
        row_id: tree.row_id ?? '',
        position: tree.position ?? 0,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
