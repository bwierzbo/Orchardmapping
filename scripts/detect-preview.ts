/**
 * Preview tree detection over a bbox without touching the DB: fetches
 * Esri World Imagery tiles, runs lib/tree-detect, prints a summary and
 * writes detections to scripts/data/detect-preview.geojson for QGIS/
 * geojson.io inspection. Usage:
 *   npx tsx scripts/detect-preview.ts <minLng> <minLat> <maxLng> <maxLat> [zoom] [threshold] [spacingM]
 */
import { decode, encode } from 'jpeg-js';
import { writeFileSync } from 'fs';
import {
  ESRI_TILE_URL,
  lngLatToWorldPx,
  detectTreesInPolygon,
  DEFAULT_DETECT_OPTIONS,
} from '../lib/tree-detect';

const [minLng, minLat, maxLng, maxLat] = process.argv.slice(2, 6).map(Number);
const zoom = Number(process.argv[6] ?? 19);
const threshold = Number(process.argv[7] ?? DEFAULT_DETECT_OPTIONS.threshold);
const spacing = Number(process.argv[8] ?? DEFAULT_DETECT_OPTIONS.minSpacingM);

if ([minLng, minLat, maxLng, maxLat].some((v) => !Number.isFinite(v))) {
  console.error('Usage: detect-preview.ts minLng minLat maxLng maxLat [zoom] [threshold] [spacingM]');
  process.exit(1);
}

async function main() {
  const tl = lngLatToWorldPx(minLng, maxLat, zoom);
  const br = lngLatToWorldPx(maxLng, minLat, zoom);
  const tx0 = Math.floor(tl.x / 256), ty0 = Math.floor(tl.y / 256);
  const tx1 = Math.floor(br.x / 256), ty1 = Math.floor(br.y / 256);
  const cols = tx1 - tx0 + 1, rows = ty1 - ty0 + 1;
  console.log(`tiles: ${cols}x${rows} at z${zoom}`);
  if (cols * rows > 144) throw new Error('bbox too large');

  const width = cols * 256, height = rows * 256;
  const mosaic = new Uint8ClampedArray(width * height * 4);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const res = await fetch(ESRI_TILE_URL(zoom, tx, ty));
      if (!res.ok) { console.warn(`tile ${tx},${ty} -> ${res.status}`); continue; }
      const jpg = decode(Buffer.from(await res.arrayBuffer()), { useTArray: true });
      const ox = (tx - tx0) * 256, oy = (ty - ty0) * 256;
      for (let y = 0; y < jpg.height; y++) {
        const src = y * jpg.width * 4;
        const dst = ((oy + y) * width + ox) * 4;
        mosaic.set(jpg.data.subarray(src, src + jpg.width * 4), dst);
      }
    }
  }

  const ring: [number, number][] = [
    [minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat],
  ];
  const t0 = performance.now();
  const found = detectTreesInPolygon(
    mosaic, width, height, tx0 * 256, ty0 * 256, zoom, ring,
    { ...DEFAULT_DETECT_OPTIONS, threshold, minSpacingM: spacing }
  );
  console.log(`detected ${found.length} trees in ${(performance.now() - t0).toFixed(0)}ms`);
  console.log(found.slice(0, 5));
  writeFileSync(
    'scripts/data/detect-preview.geojson',
    JSON.stringify({
      type: 'FeatureCollection',
      features: found.map((d) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
        properties: { score: Number(d.score.toFixed(3)) },
      })),
    })
  );
  console.log('wrote scripts/data/detect-preview.geojson');

  // Overlay JPEG for eyeballing: red cross at each detection.
  for (const d of found) {
    const wp = lngLatToWorldPx(d.lng, d.lat, zoom);
    const px = Math.round(wp.x - tx0 * 256), py = Math.round(wp.y - ty0 * 256);
    for (let o = -3; o <= 3; o++) {
      for (const [x, y] of [[px + o, py], [px, py + o]] as const) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = (y * width + x) * 4;
        mosaic[i] = 255; mosaic[i + 1] = 0; mosaic[i + 2] = 0;
      }
    }
  }
  const jpgOut = encode({ data: mosaic, width, height }, 85);
  writeFileSync('scripts/data/detect-preview.jpg', jpgOut.data);
  console.log('wrote scripts/data/detect-preview.jpg');
}

main().catch((e) => { console.error(e); process.exit(1); });
