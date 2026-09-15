import type { OrchardBounds, OrchardBoundary } from './types';

/**
 * Static satellite previews for orchards with no drone orthomosaic:
 * the Esri World_Imagery export endpoint returns a plain image for a
 * bbox — same imagery as the map, no API key. The bbox is padded and
 * aspect-corrected (longitude degrees shrink with latitude) so the
 * picture isn't stretched.
 */

const EXPORT_BASE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export';

/** Bounds grown ~15% and expanded on one axis to match width:height. */
export function previewBounds(
  bounds: OrchardBounds,
  width: number,
  height: number
): OrchardBounds {
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const cos = Math.max(0.05, Math.cos((midLat * Math.PI) / 180));
  // Work in meter-ish units so aspect is true on screen
  let spanX = (bounds.maxLng - bounds.minLng) * cos;
  let spanY = bounds.maxLat - bounds.minLat;
  spanX *= 1.15;
  spanY *= 1.15;
  const target = width / height;
  if (spanX / spanY < target) spanX = spanY * target;
  else spanY = spanX / target;
  const cLng = (bounds.minLng + bounds.maxLng) / 2;
  const dLng = spanX / cos / 2;
  const dLat = spanY / 2;
  return {
    minLng: cLng - dLng,
    maxLng: cLng + dLng,
    minLat: midLat - dLat,
    maxLat: midLat + dLat,
  };
}

export function satellitePreviewUrl(
  bounds: OrchardBounds,
  width = 660,
  height = 440
): string {
  const b = previewBounds(bounds, width, height);
  const params = new URLSearchParams({
    bbox: `${b.minLng},${b.minLat},${b.maxLng},${b.maxLat}`,
    bboxSR: '4326',
    imageSR: '4326',
    size: `${width},${height}`,
    format: 'jpg',
    f: 'image',
  });
  return `${EXPORT_BASE}?${params.toString()}`;
}

/**
 * SVG polygon points for a boundary drawn over the preview image, in
 * the same padded bbox (equirectangular — negligible error at orchard
 * scale). Empty string when the boundary has no ring.
 */
export function boundarySvgPoints(
  boundary: OrchardBoundary,
  bounds: OrchardBounds,
  width = 660,
  height = 440
): string {
  const b = previewBounds(bounds, width, height);
  const ring = boundary.coordinates[0] ?? [];
  return ring
    .map(([lng, lat]) => {
      const x = ((lng - b.minLng) / (b.maxLng - b.minLng)) * width;
      const y = ((b.maxLat - lat) / (b.maxLat - b.minLat)) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
