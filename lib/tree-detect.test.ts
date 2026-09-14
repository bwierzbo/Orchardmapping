import { describe, it, expect } from 'vitest';
import {
  metersBetween,
  metersPerPixel,
  lngLatToWorldPx,
  worldPxToLngLat,
  pointInRing,
  scorePixels,
  boxBlur,
  findPeaks,
  detectTreesInPolygon,
} from './tree-detect';

describe('mercator math', () => {
  it('round-trips lng/lat through world pixels', () => {
    const { x, y } = lngLatToWorldPx(-123.11338, 48.10805, 19);
    const back = worldPxToLngLat(x, y, 19);
    expect(back.lng).toBeCloseTo(-123.11338, 6);
    expect(back.lat).toBeCloseTo(48.10805, 6);
  });

  it('meters per pixel shrinks with latitude and zoom', () => {
    expect(metersPerPixel(0, 19)).toBeCloseTo(0.2986, 3);
    expect(metersPerPixel(48, 19)).toBeLessThan(metersPerPixel(0, 19));
    expect(metersPerPixel(48, 20)).toBeCloseTo(metersPerPixel(48, 19) / 2, 6);
  });

  it('metersBetween matches a known distance', () => {
    // one degree of longitude at latitude 48 is about 74.6 km
    const d = metersBetween(-123, 48, -122, 48);
    expect(d).toBeGreaterThan(74000);
    expect(d).toBeLessThan(75500);
  });
});

describe('pointInRing', () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  it('accepts inside points and rejects outside points', () => {
    expect(pointInRing(5, 5, square)).toBe(true);
    expect(pointInRing(11, 5, square)).toBe(false);
    expect(pointInRing(-1, -1, square)).toBe(false);
  });
});

/** Synthetic imagery: tan grass background with dark-green discs. */
function syntheticOrchard(
  width: number,
  height: number,
  crowns: { x: number; y: number; r: number }[]
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let tree = false;
      for (const c of crowns) {
        if ((x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r) {
          tree = true;
          break;
        }
      }
      if (tree) {
        rgba[i] = 40; rgba[i + 1] = 110; rgba[i + 2] = 45; // dark green crown
      } else {
        rgba[i] = 180; rgba[i + 1] = 170; rgba[i + 2] = 130; // dry grass
      }
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

describe('detection pipeline', () => {
  it('scores crowns above grass', () => {
    const img = syntheticOrchard(32, 32, [{ x: 16, y: 16, r: 6 }]);
    const score = scorePixels(img, 32, 32);
    // What matters is separation: crown scores several times grass
    expect(score[16 * 32 + 16]).toBeGreaterThan(0.2);
    expect(score[2 * 32 + 2]).toBeLessThan(0.08);
    expect(score[16 * 32 + 16]).toBeGreaterThan(score[2 * 32 + 2] * 3);
  });

  it('box blur preserves total mass roughly and smooths peaks', () => {
    const src = new Float32Array(25);
    src[12] = 1; // single spike in a 5x5
    const out = boxBlur(src, 5, 5, 1);
    expect(out[12]).toBeLessThan(1);
    expect(out[12]).toBeGreaterThan(out[0]);
  });

  it('findPeaks enforces minimum spacing', () => {
    const w = 20, h = 20;
    const score = new Float32Array(w * h);
    score[10 * w + 5] = 1;
    score[10 * w + 7] = 0.9; // 2px away — should be suppressed at spacing 5
    score[10 * w + 15] = 0.8;
    const peaks = findPeaks(score, w, h, 0.5, 5);
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toMatchObject({ x: 5, y: 10 });
    expect(peaks[1]).toMatchObject({ x: 15, y: 10 });
  });

  it('finds every crown of a synthetic block and nothing else', () => {
    // 256px tile at z19 near lat 48 ≈ 0.2 m/px: 15px ≈ 3m crowns, 40px ≈ 8m spacing
    const crowns = [
      { x: 60, y: 60, r: 8 },
      { x: 100, y: 60, r: 8 },
      { x: 140, y: 60, r: 8 },
      { x: 60, y: 100, r: 8 },
      { x: 100, y: 100, r: 8 },
      { x: 140, y: 100, r: 8 },
    ];
    const img = syntheticOrchard(256, 256, crowns);
    // World-pixel origin for a tile containing lat ~48 (value is arbitrary
    // for the math — detection is origin-relative)
    const origin = lngLatToWorldPx(-123.114, 48.108, 19);
    const originX = Math.floor(origin.x / 256) * 256;
    const originY = Math.floor(origin.y / 256) * 256;
    const corners = [
      worldPxToLngLat(originX, originY, 19),
      worldPxToLngLat(originX + 256, originY, 19),
      worldPxToLngLat(originX + 256, originY + 256, 19),
      worldPxToLngLat(originX, originY + 256, 19),
    ];
    const ring: [number, number][] = corners.map((c) => [c.lng, c.lat]);
    const found = detectTreesInPolygon(img, 256, 256, originX, originY, 19, ring, {
      minSpacingM: 3,
      threshold: 0.14,
      crownRadiusM: 1.5,
    });
    expect(found).toHaveLength(crowns.length);
    // Every crown center has a detection within ~1.5 m
    for (const c of crowns) {
      const cLL = worldPxToLngLat(originX + c.x, originY + c.y, 19);
      const nearest = Math.min(
        ...found.map((d) => metersBetween(d.lng, d.lat, cLL.lng, cLL.lat))
      );
      expect(nearest).toBeLessThan(1.5);
    }
  });

  it('excludes detections outside the drawn ring', () => {
    const img = syntheticOrchard(256, 256, [
      { x: 60, y: 60, r: 8 },
      { x: 200, y: 200, r: 8 },
    ]);
    const origin = lngLatToWorldPx(-123.114, 48.108, 19);
    const originX = Math.floor(origin.x / 256) * 256;
    const originY = Math.floor(origin.y / 256) * 256;
    // Ring covering only the top-left quadrant
    const tl = worldPxToLngLat(originX, originY, 19);
    const mid = worldPxToLngLat(originX + 128, originY + 128, 19);
    const ring: [number, number][] = [
      [tl.lng, tl.lat],
      [mid.lng, tl.lat],
      [mid.lng, mid.lat],
      [tl.lng, mid.lat],
    ];
    const found = detectTreesInPolygon(img, 256, 256, originX, originY, 19, ring);
    expect(found).toHaveLength(1);
  });
});
