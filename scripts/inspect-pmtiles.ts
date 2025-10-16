#!/usr/bin/env node

/**
 * Inspect PMTiles file
 * Usage: npx tsx scripts/inspect-pmtiles.ts <pmtiles-file>
 */

import { PMTiles } from 'pmtiles';
import fs from 'fs';

const filePath = process.argv[2];

if (!filePath) {
  console.log('Usage: npx tsx scripts/inspect-pmtiles.ts <pmtiles-file>');
  process.exit(1);
}

async function inspect(path: string) {
  try {
    console.log(`Inspecting: ${path}`);
    console.log('---');

    const pmtiles = new PMTiles(path);

    // Get header
    const header = await pmtiles.getHeader();
    console.log('\nHeader:');
    console.log(JSON.stringify(header, null, 2));

    // Get metadata
    const metadata = await pmtiles.getMetadata();
    console.log('\nMetadata:');
    console.log(JSON.stringify(metadata, null, 2));

  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

inspect(filePath);
