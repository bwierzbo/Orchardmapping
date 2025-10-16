#!/usr/bin/env node

/**
 * Quick check of PMTiles type
 */

import fs from 'fs';

const filePath = process.argv[2] || 'public/orchards/manytreesorchard/manytrees.pmtiles';

// Read first 127 bytes (PMTiles header)
const buffer = fs.readFileSync(filePath);
const header = buffer.slice(0, 127);

// Byte 52 is the tile type
const tileType = header[52];

const types: Record<number, string> = {
  0: 'Unknown',
  1: 'MVT (Mapbox Vector Tiles)',
  2: 'PNG',
  3: 'JPEG',
  4: 'WEBP',
  5: 'AVIF'
};

console.log(`File: ${filePath}`);
console.log(`Tile Type (byte 52): ${tileType} = ${types[tileType] || 'Unknown'}`);
console.log(`File size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

// Check if it's raster (image) or vector
if (tileType === 1) {
  console.log('✓ This is VECTOR data (tree points, polygons)');
  console.log('✗ NOT imagery - cannot be used for orthophoto layer');
} else if (tileType >= 2 && tileType <= 5) {
  console.log('✓ This is RASTER data (imagery)');
  console.log('✓ Can be used for orthophoto layer');
} else {
  console.log('? Unknown tile type');
}
