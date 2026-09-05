/**
 * Shared domain types used across server and client.
 */

export interface OrchardBounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** [lng, lat] — GeoJSON axis order */
export type LngLat = [number, number];

/**
 * An orchard's planted footprint as a GeoJSON Polygon geometry: an outer
 * ring first, optional holes after. Rings are closed (last position
 * repeats the first). Traced from aerial imagery for orchards that have
 * not been flown yet; see lib/orchard-boundary.ts.
 */
export interface OrchardBoundary {
  type: 'Polygon';
  coordinates: LngLat[][];
}

export interface OrchardConfig {
  id: string;
  name: string;
  location: string;
  description: string;
  center: [number, number]; // [lng, lat]
  bounds: OrchardBounds;
  defaultZoom: number;
  minZoom: number;
  maxZoom: number;
  tileMinZoom: number;
  tileMaxZoom: number;
  /** Legacy API tile path ({z}/{x}/{y}); empty for Blob-backed orchards */
  orthoPath: string;
  /** URL to orthomosaic PMTiles (Blob URL or site-relative path) */
  orthoPmtilesPath?: string;
  /** URL to vector-data PMTiles (unused by the viewer; trees come from the DB) */
  pmtilesPath: string;
  previewImage?: string;
  /** Planted footprint traced from imagery; drawn when present */
  boundary?: OrchardBoundary;
  stats?: {
    trees?: number;
    blocks?: number;
    rows?: number;
  };
}

export const TREE_STATUSES = ['healthy', 'stressed', 'dead', 'unknown'] as const;
export type TreeStatus = (typeof TREE_STATUSES)[number];

export function asTreeStatus(value: string | null | undefined): TreeStatus {
  return (TREE_STATUSES as readonly string[]).includes(value ?? '')
    ? (value as TreeStatus)
    : 'unknown';
}

/**
 * A tree as the client sees it: DATE columns as 'YYYY-MM-DD' strings,
 * timestamps as ISO strings. Produced by serializeTree on the server.
 */
export interface ClientTree {
  id: number;
  tree_id: string;
  orchard_id: string;
  name?: string | null;
  variety?: string | null;
  status: TreeStatus;
  planted_date?: string | null;
  block_id?: string | null;
  row_id?: string | null;
  position?: number | null;
  age?: number | null;
  height?: number | null;
  lat?: number | null;
  lng?: number | null;
  last_pruned?: string | null;
  last_harvest?: string | null;
  yield_estimate?: number | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}
