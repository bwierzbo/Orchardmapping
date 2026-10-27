import { varietiesOf } from './grafts';
import type { ClientTree, TreeStatus } from './types';
import { isHarvestComplete } from './tree-harvest-season';

/** Status colors shared by the map layer, legend chips, and badges. */
export const STATUS_COLORS: Record<TreeStatus, string> = {
  healthy: '#1F9D4D',
  stressed: '#DB9E00',
  dead: '#C0392B',
  unknown: '#7C8894',
};

/** The disc behind the harvest-complete check, on the map and in its legend. */
export const HARVEST_BADGE_COLOR = '#2F6B3F';

export interface TreeFeatureProperties {
  tree_id: string;
  status: TreeStatus;
  variety: string;
  row_id: string;
  position: string;
  /** Picked out this season: the map draws a check on the dot. */
  harvest_complete: boolean;
}

/**
 * Build the GeoJSON FeatureCollection backing the tree layers.
 * feature.id is the numeric DB id so MapLibre feature-state works.
 */
export function treesToFeatureCollection(
  trees: ClientTree[],
  statusFilter?: ReadonlySet<TreeStatus>,
  /** The grower's current calendar year; "complete" means complete in it. */
  seasonYear: number = new Date().getFullYear()
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
        // "Gala + Chehalis" on a grafted tree, so the tooltip says so
        variety: varietiesOf(tree).join(' + '),
        row_id: tree.row_id ?? '',
        position: tree.position ?? '',
        harvest_complete: isHarvestComplete(tree.harvest_completed_on, seasonYear),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
