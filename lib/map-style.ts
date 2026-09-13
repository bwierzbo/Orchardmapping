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
const SATELLITE_SOURCE = 'satellite-basemap';
export const SATELLITE_LAYER = 'satellite-basemap';

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
    // Needed for symbol layers (cluster counts, area labels). Glyphs
    // are self-hosted (public/glyphs, vendored from protomaps
    // basemaps-assets): fonts.openmaptiles.org began returning HTML
    // with HTTP 200, which the worker fails to parse as protobuf and
    // that silently killed every layer of any source with a symbol
    // layer (the invisible-areas bug, 2026-09).
    glyphs: `${origin}/glyphs/{fontstack}/{range}.pbf`,
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

  const hasOrthoImagery = Boolean(orchard.orthoPmtilesPath || orchard.orthoPath);

  // Pre-flight orchards have no orthomosaic of their own. Put satellite
  // imagery underneath so the traced block can be checked against the
  // real ground (Esri World Imagery — the source these traces come from).
  if (!hasOrthoImagery && orchard.boundary) {
    style.sources[SATELLITE_SOURCE] = {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    };
    style.layers.push({
      id: SATELLITE_LAYER,
      type: 'raster',
      source: SATELLITE_SOURCE,
      paint: { 'raster-opacity': 1 },
    });
  }

  if (orchard.boundary) {
    const hasOrtho = hasOrthoImagery;
    style.sources[BOUNDARY_SOURCE] = {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: orchard.boundary,
      },
    };
    // Over an orthomosaic a fill would only hide it, so there is none.
    // Pre-flight orchards now have satellite imagery underneath too, so the
    // fill is faint — the block reads as highlighted, not covered.
    if (!hasOrtho) {
      style.layers.push({
        id: BOUNDARY_FILL_LAYER,
        type: 'fill',
        source: BOUNDARY_SOURCE,
        paint: { 'fill-color': '#7f9a6d', 'fill-opacity': 0.12 },
      });
    }
    style.layers.push({
      id: BOUNDARY_LINE_LAYER,
      type: 'line',
      source: BOUNDARY_SOURCE,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': '#D9481C',
        'line-width': 3,
        'line-opacity': 0.95,
      },
    });
  }

  return style;
}
