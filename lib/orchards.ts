// Orchard configuration types and data

export interface OrchardBounds {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
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
  orthoPath: string; // Path to orthomosaic tiles (deprecated, use orthoPmtilesPath)
  orthoPmtilesPath?: string; // Path to orthomosaic PMTiles file
  pmtilesPath: string; // Path to PMTiles file for vector data
  previewImage?: string; // Optional preview image for selector
  stats?: {
    trees?: number; // Note: Tree count is now fetched dynamically from database
    blocks?: number;
    rows?: number;
  };
}

// Registry of available orchards
export const orchards: Record<string, OrchardConfig> = {
  washington: {
    id: 'washington',
    name: 'Home Orchard',
    location: 'Washington State, USA',
    description: 'Apple orchard in the Pacific Northwest',
    center: [-123.26415, 48.11401],
    bounds: {
      minLng: -123.26452,
      minLat: 48.11370,
      maxLng: -123.26379,
      maxLat: 48.11433
    },
    defaultZoom: 18,
    minZoom: 5,
    maxZoom: 21.5, // Limited below tile max to prevent map disappearing at full zoom
    tileMinZoom: 5,
    tileMaxZoom: 23,
    orthoPath: '/orchards/washington/ortho',
    orthoPmtilesPath: '/orchards/washington/tiles/orthomap.pmtiles', // PMTiles with orthomosaic imagery
    // pmtilesPath removed - now using database trees only
    previewImage: '/orchards/washington/preview.jpg',
    stats: {
      blocks: 8,
      rows: 42
    }
  },
  manytrees: {
    id: 'manytrees',
    name: 'Many Trees Orchard',
    location: 'Washington State, USA',
    description: 'Orchard mapping with ODM orthophoto',
    center: [-123.16743, 48.14192],
    bounds: {
      minLng: -123.16823,
      minLat: 48.14138,
      maxLng: -123.16663,
      maxLat: 48.14245
    },
    defaultZoom: 18,
    minZoom: 5,
    maxZoom: 21.5, // Limited below tile max to prevent map disappearing at full zoom
    tileMinZoom: 5,
    tileMaxZoom: 23,
    orthoPath: '/api/tiles/manytrees/{z}/{x}/{y}', // Served via API with Y-flip fix
    orthoPmtilesPath: '', // Using API tiles instead due to hemisphere issue
    pmtilesPath: '', // No vector tree data yet
    previewImage: '/orchards/manytreesorchard/preview.jpg'
  }
};

// Helper functions
export function getOrchardById(id: string): OrchardConfig | null {
  return orchards[id] || null;
}

export function getAllOrchards(): OrchardConfig[] {
  return Object.values(orchards);
}

export function getOrchardIds(): string[] {
  return Object.keys(orchards);
}

// Get the default orchard (first in the list)
export function getDefaultOrchard(): OrchardConfig {
  return Object.values(orchards)[0];
}