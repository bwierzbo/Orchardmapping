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

const BOUNDARY_SOURCE = 'orchard-boundary';
export const BOUNDARY_FILL_LAYER = 'orchard-boundary-fill';
export const BOUNDARY_LINE_LAYER = 'orchard-boundary-line';

/**
 * Build the map style for an orchard: the orthomosaic raster (PMTiles or
 * legacy {z}/{x}/{y} API path) over a plain background, with the planted
 * boundary drawn on top. No external basemap — tile usage policies and
 * wasted downloads killed the old OSM layer; deep links open at orchard
 * zoom where imagery fills the view.
 *
 * An orchard with a boundary but no orthomosaic is the pre-flight case:
 * the block is filled so it reads as a shape against the background and
 * trees can be placed inside it. Once imagery exists the fill would only
 * hide it, so only the outline survives.
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

  if (orchard.boundary) {
    const hasOrtho = Boolean(orchard.orthoPmtilesPath || orchard.orthoPath);
    style.sources[BOUNDARY_SOURCE] = {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: orchard.boundary,
      },
    };
    if (!hasOrtho) {
      style.layers.push({
        id: BOUNDARY_FILL_LAYER,
        type: 'fill',
        source: BOUNDARY_SOURCE,
        paint: { 'fill-color': '#7f9a6d', 'fill-opacity': 0.35 },
      });
    }
    style.layers.push({
      id: BOUNDARY_LINE_LAYER,
      type: 'line',
      source: BOUNDARY_SOURCE,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#3f5540',
        'line-width': 2,
        'line-opacity': hasOrtho ? 0.9 : 0.7,
      },
    });
  }

  return style;
}
