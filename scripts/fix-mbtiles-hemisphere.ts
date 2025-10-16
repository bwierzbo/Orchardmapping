#!/usr/bin/env node

/**
 * Fix mbtiles with inverted Y coordinates by creating a corrected copy
 */

import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import fs from 'fs';

const inputPath = 'public/orchards/manytreesorchard/manytrees.mbtiles';
const outputPath = 'public/orchards/manytreesorchard/manytrees-corrected.mbtiles';

console.log('This would fix the hemisphere issue by flipping Y coordinates...');
console.log('\nHowever, we need the sqlite3 npm package.');
console.log('Instead, let\'s use the pmtiles CLI with a workaround.');
console.log('\nThe issue: tiles are indexed at -48.14°S instead of 48.14°N');
console.log('Solution: We need to regenerate the tiles from the original imagery');
console.log('          OR serve tiles directly without using the spatial index');
