/**
 * Orchard boundary ("cutout") helpers.
 *
 * A boundary is the orchard's planted footprint as a GeoJSON Polygon,
 * traced from aerial imagery. It exists so an orchard is usable before a
 * drone flight: the viewer draws the outline, and trees get placed
 * against it instead of against a blank background.
 *
 * Everything here is pure — no database, no map — so it is shared by the
 * creation script, the API, and the client.
 */

import type { LngLat, OrchardBoundary, OrchardBounds } from './types';

/** Web Mercator caps out just shy of the poles */
const MAX_MERCATOR_LAT = 85.05112878;

function isFinitePosition(value: unknown): value is LngLat {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

/**
 * Coerce an unknown value (a JSONB column, a parsed file) into a
 * boundary, or undefined if it is not one. Accepts either a bare Polygon
 * geometry or a Feature wrapping one, since hand-drawn exports from QGIS
 * and geojson.io come both ways.
 *
 * Rings are closed if the source left them open, and positions are
 * truncated to [lng, lat] (elevation, if present, is dropped).
 */
export function parseBoundary(value: unknown): OrchardBoundary | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const candidate = value as { type?: unknown; geometry?: unknown; coordinates?: unknown };
  if (candidate.type === 'Feature') return parseBoundary(candidate.geometry);
  if (candidate.type !== 'Polygon' || !Array.isArray(candidate.coordinates)) return undefined;

  const rings: LngLat[][] = [];
  for (const ring of candidate.coordinates) {
    if (!Array.isArray(ring)) return undefined;
    const positions: LngLat[] = [];
    for (const position of ring) {
      if (!isFinitePosition(position)) return undefined;
      positions.push([position[0], position[1]]);
    }
    // A closed ring needs 4 positions; an open one of 3 closes into a triangle
    if (positions.length < 3) return undefined;
    const first = positions[0];
    const last = positions[positions.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) positions.push([first[0], first[1]]);
    if (positions.length < 4) return undefined;
    rings.push(positions);
  }

  return rings.length > 0 ? { type: 'Polygon', coordinates: rings } : undefined;
}

/** Bounding box of a boundary's outer ring. */
export function boundaryBounds(boundary: OrchardBoundary): OrchardBounds {
  const [outer] = boundary.coordinates;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of outer) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat };
}

/**
 * Centre of a boundary's bounding box as [lng, lat].
 *
 * The bbox centre, not the centroid: for the rectangular blocks these
 * boundaries describe they coincide, and the bbox centre is what keeps
 * the camera framed on the same thing the bounds describe.
 */
export function boundaryCenter(boundary: OrchardBoundary): LngLat {
  const { minLng, minLat, maxLng, maxLat } = boundaryBounds(boundary);
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

/** Latitude -> Web Mercator y, normalized to 0 (north) .. 1 (south). */
function mercatorY(lat: number): number {
  const clamped = Math.min(Math.max(lat, -MAX_MERCATOR_LAT), MAX_MERCATOR_LAT);
  const radians = (clamped * Math.PI) / 180;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / (2 * Math.PI);
}

/**
 * The zoom at which `bounds` fills a `viewport`-pixel square, with a
 * little breathing room — i.e. what to open a new orchard at.
 *
 * Returns a fractional zoom; callers writing to the INTEGER tile-zoom
 * columns must round.
 */
export function zoomForBounds(bounds: OrchardBounds, viewport = 900, padding = 1.15): number {
  const worldFractionX = Math.abs(bounds.maxLng - bounds.minLng) / 360;
  const worldFractionY = Math.abs(mercatorY(bounds.minLat) - mercatorY(bounds.maxLat));
  const largest = Math.max(worldFractionX, worldFractionY);
  // A degenerate (zero-area) box has no meaningful fit; fall back to the
  // schema default rather than returning Infinity.
  if (!(largest > 0)) return 18;
  const zoom = Math.log2(viewport / (256 * largest * padding));
  return Math.min(Math.max(zoom, 1), 22);
}
