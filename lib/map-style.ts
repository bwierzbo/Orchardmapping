import type { StyleSpecification } from 'maplibre-gl';
import type { OrchardConfig } from './types';

/**
 * Resolve a PMTiles path (Blob URL or site-relative) into an absolute
 * pmtiles:// source URL. Relative paths previously produced malformed
 * `pmtiles:///...` URLs that never matched the registered protocol.
 */
export function pmtilesSourceUrl(path: string, origin: string): string {
  const absolute = path.startsWith('http') ? path : new URL(path, origin).toString();
  return `pmtiles://${absolute}`;
}

/**
 * Build the map style for an orchard: the orthomosaic raster (PMTiles or
 * legacy {z}/{x}/{y} API path) over a plain background. No external
 * basemap — tile usage policies and wasted downloads killed the old OSM
 * layer; deep links open at orchard zoom where imagery fills the view.
 */
export function buildMapStyle(orchard: OrchardConfig, origin: string): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    // Needed for symbol layers (cluster counts, optional labels)
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#e8eae5' },
      },
    ],
  };

  if (orchard.orthoPmtilesPath) {
    style.sources['orchard-ortho'] = {
      type: 'raster',
      url: pmtilesSourceUrl(orchard.orthoPmtilesPath, origin),
      tileSize: 256,
      minzoom: orchard.tileMinZoom,
      maxzoom: orchard.tileMaxZoom,
    };
    style.layers.push({
      id: 'orchard-ortho',
      type: 'raster',
      source: 'orchard-ortho',
      paint: { 'raster-opacity': 1 },
    });
  } else if (orchard.orthoPath) {
    style.sources['orchard-ortho'] = {
      type: 'raster',
      tiles: [
        orchard.orthoPath.startsWith('http')
          ? orchard.orthoPath
          : new URL(orchard.orthoPath, origin).toString(),
      ],
      tileSize: 256,
      minzoom: orchard.tileMinZoom,
      maxzoom: orchard.tileMaxZoom,
    };
    style.layers.push({
      id: 'orchard-ortho',
      type: 'raster',
      source: 'orchard-ortho',
      paint: { 'raster-opacity': 1 },
    });
  }

  return style;
}
