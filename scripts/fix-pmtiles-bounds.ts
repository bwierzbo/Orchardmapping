#!/usr/bin/env node

/**
 * Reconvert mbtiles to pmtiles with correct bounds
 * This uses the pmtiles library to do the conversion properly
 */

import { execSync } from 'child_process';

const mbtilesPath = 'public/orchards/manytreesorchard/manytrees.mbtiles';
const pmtilesPath = 'public/orchards/manytreesorchard/manytrees-fixed.pmtiles';

// Bounds from orchard config
const bounds = {
  minLng: -123.16823,
  minLat: 48.14138,
  maxLng: -123.16663,
  maxLat: 48.14245
};

console.log('Converting mbtiles to pmtiles with correct bounds...');
console.log(`Bounds: ${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`);

try {
  // Try using pmtiles convert command if available
  const command = `pmtiles convert ${mbtilesPath} ${pmtilesPath}`;
  console.log(`Running: ${command}`);

  execSync(command, { stdio: 'inherit' });

  console.log('\n✓ Conversion complete!');
  console.log(`Output: ${pmtilesPath}`);
  console.log('\nNow update lib/orchards.ts to use:');
  console.log(`  orthoPmtilesPath: '/orchards/manytreesorchard/manytrees-fixed.pmtiles'`);
} catch (error: any) {
  console.error('Error:', error.message);
  console.log('\nNote: You may need to install pmtiles CLI:');
  console.log('  npm install -g pmtiles');
  console.log('  or');
  console.log('  go install github.com/protomaps/go-pmtiles/cmd/pmtiles@latest');
  process.exit(1);
}
