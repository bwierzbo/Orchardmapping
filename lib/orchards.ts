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
    trees?: number;
    blocks?: number;
    rows?: number;
    acres?: number;
  };
}

// Registry of available orchards
export const orchards: Record<string, OrchardConfig> = {
  washington: {
    id: 'washington',
    name: 'Washington Orchard',
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
    pmtilesPath: '/orchards/washington/tiles/trees.pmtiles', // PMTiles with tree data
    previewImage: '/orchards/washington/preview.jpg',
    stats: {
      trees: 1250,
      blocks: 8,
      rows: 42,
      acres: 15
    }
  },
  california: {
    id: 'california',
    name: 'Central Valley Orchard',
    location: 'Central Valley, California',
    description: 'Citrus orchard in California\'s agricultural heartland',
    center: [-119.7871, 36.7378],
    bounds: {
      minLng: -119.7900,
      minLat: 36.7350,
      maxLng: -119.7842,
      maxLat: 36.7406
    },
    defaultZoom: 17,
    minZoom: 5,
    maxZoom: 20.5, // Limited below tile max to prevent map disappearing at full zoom
    tileMinZoom: 5,
    tileMaxZoom: 21,
    orthoPath: '/orchards/california/ortho',
    pmtilesPath: '',
    previewImage: '/orchards/california/preview.jpg',
    stats: {
      trees: 2100,
      blocks: 12,
      rows: 68,
      acres: 25
    }
  },
  oregon: {
    id: 'oregon',
    name: 'Willamette Valley Orchard',
    location: 'Willamette Valley, Oregon',
    description: 'Pear and cherry orchard in Oregon\'s fertile valley',
    center: [-123.0351, 44.9429],
    bounds: {
      minLng: -123.0380,
      minLat: 44.9400,
      maxLng: -123.0322,
      maxLat: 44.9458
    },
    defaultZoom: 17,
    minZoom: 5,
    maxZoom: 21.5, // Limited below tile max to prevent map disappearing at full zoom
    tileMinZoom: 6,
    tileMaxZoom: 22,
    orthoPath: '/orchards/oregon/ortho',
    pmtilesPath: '',
    previewImage: '/orchards/oregon/preview.jpg',
    stats: {
      trees: 850,
      blocks: 6,
      rows: 32,
      acres: 10
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
    orthoPath: '/orchards/manytreesorchard/ortho',
    orthoPmtilesPath: '/orchards/manytreesorchard/manytrees.pmtiles', // PMTiles with orthomosaic imagery
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