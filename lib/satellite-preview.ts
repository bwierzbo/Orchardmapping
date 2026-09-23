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

/**
 * How small a preview is allowed to get, in metres across.
 *
 * Esri's imagery here is roughly half a metre per pixel, so framing an
 * orchard whose three trees sit seven metres apart would fill 660 pixels
 * with upscaled blur. Below this the picture stops gaining information
 * and starts inventing it.
 */
export const MIN_PREVIEW_SPAN_M = 80;

const M_PER_DEG_LAT = 111_320;

/**
 * The box a preview should actually frame.
 *
 * NOT the orchard's stored bounds. Those describe the imagery footprint
 * or, for an orchard added from a single found tree, an arbitrary box
 * drawn around a point — which is why Terry Anderson's three trees came
 * out filling one percent of the width of a half-kilometre field. What
 * somebody wants to see on a card is the planting: the trees, and the
 * boundary if one has been drawn.
 *
 * Falls back to the stored bounds when there is neither, because an
 * orchard with nothing mapped yet still has to show something.
 */
export function contentBounds(
  treeExtent: OrchardBounds | null,
  boundary: OrchardBoundary | null,
  stored: OrchardBounds
): OrchardBounds {
  const boxes: OrchardBounds[] = [];
  if (treeExtent) boxes.push(treeExtent);
  const ring = boundary?.coordinates[0] ?? [];
  if (ring.length > 0) {
    boxes.push({
      minLng: Math.min(...ring.map(([lng]) => lng)),
      maxLng: Math.max(...ring.map(([lng]) => lng)),
      minLat: Math.min(...ring.map(([, lat]) => lat)),
      maxLat: Math.max(...ring.map(([, lat]) => lat)),
    });
  }
  if (boxes.length === 0) return stored;
  return {
    minLng: Math.min(...boxes.map((b) => b.minLng)),
    maxLng: Math.max(...boxes.map((b) => b.maxLng)),
    minLat: Math.min(...boxes.map((b) => b.minLat)),
    maxLat: Math.max(...boxes.map((b) => b.maxLat)),
  };
}

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
  // A single tree, or three of them in a row, gives a span of nearly
  // nothing. Open the box to something the imagery can actually fill.
  const minSpan = MIN_PREVIEW_SPAN_M / M_PER_DEG_LAT;
  spanX = Math.max(spanX, minSpan);
  spanY = Math.max(spanY, minSpan);
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

/**
 * Tree positions as SVG circle centres over the preview, in the same
 * frame as the image and the boundary.
 *
 * Without these a card is a square of grass: the boundary is only drawn
 * where somebody has traced one, and most orchards have not. The dots
 * are what make the planting visible, which is the whole point of the
 * picture.
 */
export function treeSvgPoints(
  points: ReadonlyArray<readonly [number, number]>,
  bounds: OrchardBounds,
  width = 660,
  height = 440
): Array<{ x: number; y: number }> {
  const b = previewBounds(bounds, width, height);
  const spanLng = b.maxLng - b.minLng;
  const spanLat = b.maxLat - b.minLat;
  if (spanLng === 0 || spanLat === 0) return [];
  return points.map(([lng, lat]) => ({
    x: Number((((lng - b.minLng) / spanLng) * width).toFixed(1)),
    y: Number((((b.maxLat - lat) / spanLat) * height).toFixed(1)),
  }));
}
