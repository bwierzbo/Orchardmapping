/**
 * Tree-crown detection on satellite/orthomosaic RGBA pixels.
 *
 * Classic blob detection, no ML: score every pixel by vegetation
 * greenness (excess-green index), blur to crown scale, then pick
 * local maxima with a minimum-spacing suppression. Works on distinct
 * crowns over grass/soil — the orchard case — and is expected to miss
 * whips and merge touching canopies; the user cleans those up by hand.
 *
 * Pure functions over pixel buffers so the same code runs in the
 * browser (canvas ImageData) and in Node scripts/tests.
 */

export const ESRI_TILE_URL = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

export interface DetectOptions {
  /** Minimum distance between two detected trees, meters. */
  minSpacingM: number;
  /** Greenness score threshold 0..1 — lower finds more (and more junk). */
  threshold: number;
  /** Approximate crown radius in meters (sets the blur scale). */
  crownRadiusM: number;
}

export const DEFAULT_DETECT_OPTIONS: DetectOptions = {
  minSpacingM: 3,
  threshold: 0.14,
  crownRadiusM: 1.5,
};

export interface Detection {
  lng: number;
  lat: number;
  score: number;
}

/** Meters between two lng/lat points (equirectangular, fine at orchard scale). */
export function metersBetween(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const mLat = 111320;
  const mLng = 111320 * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  return Math.hypot((aLng - bLng) * mLng, (aLat - bLat) * mLat);
}

// ---- Web-mercator math (256px tiles) ----

export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Continuous world-pixel coords at a zoom (256 * 2^z square). */
export function lngLatToWorldPx(lng: number, lat: number, zoom: number): { x: number; y: number } {
  const size = 256 * 2 ** zoom;
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * size,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * size,
  };
}

export function worldPxToLngLat(
  x: number,
  y: number,
  zoom: number
): { lng: number; lat: number } {
  const size = 256 * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * y) / size;
  return {
    lng: (x / size) * 360 - 180,
    lat: (180 / Math.PI) * Math.atan(Math.sinh(n)),
  };
}

/** Ray-casting point-in-ring test; ring is open or closed [lng,lat] pairs. */
export function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ---- Pixel scoring ----

/**
 * Per-pixel tree-crown score in [0..1]: excess-green vegetation index
 * with a mild darkness bonus (crowns shade themselves; grass and bare
 * ground are brighter). Tuned on Esri World Imagery over WA orchards.
 */
export function scorePixels(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    const exg = (2 * g - r - b) / 510; // [-1..1], vegetation ≳ 0
    const darkness = 1 - (r + g + b) / 765; // [0..1]
    out[i] = Math.max(0, exg) * 0.8 + Math.max(0, darkness - 0.35) * 0.45;
  }
  return out;
}

/** Two-pass box blur (horizontal then vertical), radius in pixels. */
export function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const r = Math.max(1, Math.round(radius));
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const win = 2 * r + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = acc / win;
      const add = Math.min(width - 1, x + r + 1);
      const sub = Math.max(0, x - r);
      acc += src[row + add] - src[row + sub];
    }
  }
  for (let x = 0; x < width; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = acc / win;
      const add = Math.min(height - 1, y + r + 1);
      const sub = Math.max(0, y - r);
      acc += tmp[add * width + x] - tmp[sub * width + x];
    }
  }
  return out;
}

export interface PixelDetection {
  x: number;
  y: number;
  score: number;
}

/**
 * Local maxima of the blurred score map above threshold, greedily
 * suppressed so no two picks are closer than minSpacingPx.
 */
export function findPeaks(
  score: Float32Array,
  width: number,
  height: number,
  threshold: number,
  minSpacingPx: number
): PixelDetection[] {
  const candidates: PixelDetection[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = score[i];
      if (v < threshold) continue;
      if (
        v >= score[i - 1] && v >= score[i + 1] &&
        v >= score[i - width] && v >= score[i + width] &&
        v >= score[i - width - 1] && v >= score[i - width + 1] &&
        v >= score[i + width - 1] && v >= score[i + width + 1]
      ) {
        candidates.push({ x, y, score: v });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  // Greedy non-max suppression on a coarse grid for near-linear time.
  const cell = Math.max(1, minSpacingPx);
  const grid = new Map<string, PixelDetection[]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  const picked: PixelDetection[] = [];
  const minSq = minSpacingPx * minSpacingPx;
  for (const c of candidates) {
    const cx = Math.floor(c.x / cell);
    const cy = Math.floor(c.y / cell);
    let blocked = false;
    for (let gy = cy - 1; gy <= cy + 1 && !blocked; gy++) {
      for (let gx = cx - 1; gx <= cx + 1 && !blocked; gx++) {
        const bucket = grid.get(key(gx, gy));
        if (!bucket) continue;
        for (const p of bucket) {
          const dx = p.x - c.x;
          const dy = p.y - c.y;
          if (dx * dx + dy * dy < minSq) {
            blocked = true;
            break;
          }
        }
      }
    }
    if (blocked) continue;
    picked.push(c);
    const bucket = grid.get(key(cx, cy));
    if (bucket) bucket.push(c);
    else grid.set(key(cx, cy), [c]);
  }
  return picked;
}

/**
 * Full pipeline over an RGBA mosaic whose top-left pixel sits at
 * world-pixel (originX, originY) at `zoom`. Returns lng/lat detections
 * inside `ring` (the user-drawn polygon), best score first.
 */
export function detectTreesInPolygon(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  originX: number,
  originY: number,
  zoom: number,
  ring: [number, number][],
  options: DetectOptions = DEFAULT_DETECT_OPTIONS
): Detection[] {
  const centerLat = worldPxToLngLat(originX + width / 2, originY + height / 2, zoom).lat;
  const mpp = metersPerPixel(centerLat, zoom);
  const blurred = boxBlur(
    scorePixels(rgba, width, height),
    width,
    height,
    options.crownRadiusM / mpp
  );
  const peaks = findPeaks(blurred, width, height, options.threshold, options.minSpacingM / mpp);
  const out: Detection[] = [];
  for (const p of peaks) {
    const { lng, lat } = worldPxToLngLat(originX + p.x + 0.5, originY + p.y + 0.5, zoom);
    if (pointInRing(lng, lat, ring)) out.push({ lng, lat, score: p.score });
  }
  return out;
}
