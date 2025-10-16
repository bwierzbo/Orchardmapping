#!/usr/bin/env node

/**
 * Calculate geographic bounds from tile coordinates
 */

function tile2lon(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// From mbtiles query: zoom 23, x: 1324276-1324313, y: 2911033-2911070
const zoom = 23;
const minX = 1324276;
const maxX = 1324313;
const minY = 2911033;
const maxY = 2911070;

// Note: MBTiles uses TMS (origin bottom-left), Web Mercator uses XYZ (origin top-left)
// We need to flip Y coordinate: tms_y = (2^zoom - 1) - xyz_y
const maxTiles = Math.pow(2, zoom);
const minY_web = maxTiles - maxY - 1;
const maxY_web = maxTiles - minY - 1;

console.log('Tile coordinates (TMS):');
console.log(`  X: ${minX} - ${maxX}`);
console.log(`  Y: ${minY} - ${maxY}`);
console.log(`  Z: ${zoom}`);

console.log('\nTile coordinates (Web Mercator XYZ):');
console.log(`  X: ${minX} - ${maxX}`);
console.log(`  Y: ${minY_web} - ${maxY_web}`);
console.log(`  Z: ${zoom}`);

// Calculate bounds
const minLon = tile2lon(minX, zoom);
const maxLon = tile2lon(maxX + 1, zoom); // +1 because tile extends to next boundary
const maxLat = tile2lat(minY_web, zoom); // Note: lat increases as Y decreases
const minLat = tile2lat(maxY_web + 1, zoom);

console.log('\nGeographic bounds:');
console.log(`  minLon: ${minLon.toFixed(8)}`);
console.log(`  minLat: ${minLat.toFixed(8)}`);
console.log(`  maxLon: ${maxLon.toFixed(8)}`);
console.log(`  maxLat: ${maxLat.toFixed(8)}`);

const centerLon = (minLon + maxLon) / 2;
const centerLat = (minLat + maxLat) / 2;

console.log('\nCenter:');
console.log(`  lon: ${centerLon.toFixed(8)}`);
console.log(`  lat: ${centerLat.toFixed(8)}`);

console.log('\nOrchard config bounds:');
console.log(`  minLng: -123.16823`);
console.log(`  minLat: 48.14138`);
console.log(`  maxLng: -123.16663`);
console.log(`  maxLat: 48.14245`);
console.log(`  center: [-123.16743, 48.14192]`);
