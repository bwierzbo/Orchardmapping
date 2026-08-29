import { PMTiles } from 'pmtiles';

interface PMTilesHeader {
  minZoom: number;
  maxZoom: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  centerZoom: number;
  centerLon: number;
  centerLat: number;
  tileType: number; // 1 = raster (PNG/JPG), 2 = vector (MVT)
}

export interface PMTilesValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  metadata?: {
    bounds: {
      minLng: number;
      minLat: number;
      maxLng: number;
      maxLat: number;
    };
    center: {
      lng: number;
      lat: number;
    };
    minZoom: number;
    /** Display max zoom, capped at 21.5 to prevent map rendering issues */
    maxZoom: number;
    /** True tile pyramid max zoom from the header (integer, uncapped) */
    tileMaxZoom: number;
    tileType: 'raster' | 'vector';
  };
}

/**
 * Validate a PMTiles archive by URL and extract its metadata.
 * Reads only the header via range requests — cheap even for huge files.
 */
export async function validatePMTilesFromUrl(url: string): Promise<PMTilesValidationResult> {
  const warnings: string[] = [];

  try {
    const pmtiles = new PMTiles(url);
    const header = (await pmtiles.getHeader()) as unknown as PMTilesHeader;

    if (!header) {
      return { valid: false, error: 'Could not read PMTiles header' };
    }

    let tileType: 'raster' | 'vector';
    if (header.tileType === 1) {
      tileType = 'raster';
    } else if (header.tileType === 2) {
      tileType = 'vector';
      warnings.push('Vector PMTiles detected. This endpoint is optimized for raster/imagery tiles.');
    } else {
      return {
        valid: false,
        error: `Unsupported tile type: ${header.tileType}. Expected raster (1) or vector (2).`,
      };
    }

    if (
      header.minLon === undefined ||
      header.minLat === undefined ||
      header.maxLon === undefined ||
      header.maxLat === undefined
    ) {
      return { valid: false, error: 'PMTiles file does not contain valid geographic bounds' };
    }

    // World bounds usually mean broken georeferencing for orchard imagery
    if (
      header.minLon <= -180 &&
      header.maxLon >= 180 &&
      header.minLat <= -85 &&
      header.maxLat >= 85
    ) {
      warnings.push('PMTiles appears to have world bounds. This may indicate incorrect georeferencing.');
    }

    const centerLng = header.centerLon ?? (header.minLon + header.maxLon) / 2;
    const centerLat = header.centerLat ?? (header.minLat + header.maxLat) / 2;

    const maxZoom = Math.min(header.maxZoom, 21.5);
    if (header.maxZoom > 21.5) {
      warnings.push(`Max zoom capped at 21.5 (was ${header.maxZoom}) to prevent map rendering issues.`);
    }

    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        bounds: {
          minLng: header.minLon,
          minLat: header.minLat,
          maxLng: header.maxLon,
          maxLat: header.maxLat,
        },
        center: { lng: centerLng, lat: centerLat },
        minZoom: header.minZoom,
        maxZoom,
        tileMaxZoom: Math.round(header.maxZoom),
        tileType,
      },
    };
  } catch (error) {
    console.error('PMTiles validation error:', error);
    return {
      valid: false,
      error: `Failed to validate PMTiles: ${error instanceof Error ? error.message : 'unknown error'}`,
    };
  }
}
