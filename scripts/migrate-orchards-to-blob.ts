/**
 * Migration script: Upload existing orchard tiles to Vercel Blob
 * and update database with full configuration
 *
 * Run with: npx tsx scripts/migrate-orchards-to-blob.ts
 *
 * Prerequisites:
 * - BLOB_READ_WRITE_TOKEN env var set
 * - POSTGRES_URL env var set
 * - Database migration applied (001_add_orchard_tile_columns.sql)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { put } from '@vercel/blob';
import { sql } from '@vercel/postgres';
import * as fs from 'fs/promises';
import * as path from 'path';

// Existing orchard configurations (from lib/orchards.ts)
const existingOrchards = [
  {
    id: 'washington',
    name: 'Home Orchard',
    location: 'Washington State, USA',
    description: 'Apple orchard in the Pacific Northwest',
    center: { lng: -123.26415, lat: 48.11401 },
    bounds: {
      minLng: -123.26452,
      minLat: 48.11370,
      maxLng: -123.26379,
      maxLat: 48.11433
    },
    defaultZoom: 18,
    minZoom: 5,
    maxZoom: 21.5,
    tileMinZoom: 5,
    tileMaxZoom: 23,
    // Local file paths (relative to project root)
    localOrthoPath: 'public/orchards/washington/tiles/orthomap.pmtiles',
    localVectorPath: 'public/orchards/washington/tiles/trees.pmtiles',
  },
  {
    id: 'manytrees',
    name: 'Many Trees Orchard',
    location: 'Washington State, USA',
    description: 'Orchard mapping with ODM orthophoto',
    center: { lng: -123.16743, lat: 48.14192 },
    bounds: {
      minLng: -123.16823,
      minLat: 48.14138,
      maxLng: -123.16663,
      maxLat: 48.14245
    },
    defaultZoom: 18,
    minZoom: 5,
    maxZoom: 21.5,
    tileMinZoom: 5,
    tileMaxZoom: 23,
    // This orchard uses API tiles due to Y-flip issue, so we'll set ortho_api_path instead
    localOrthoPath: null, // 'public/orchards/manytreesorchard/manytrees.pmtiles' - has Y-flip issue
    localVectorPath: null,
    orthoApiPath: '/api/tiles/manytrees/{z}/{x}/{y}', // Uses API endpoint instead
  }
];

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function uploadFile(filePath: string, blobPath: string): Promise<string | null> {
  try {
    const absolutePath = path.join(process.cwd(), filePath);

    if (!await fileExists(absolutePath)) {
      console.log(`  File not found: ${absolutePath}`);
      return null;
    }

    const fileBuffer = await fs.readFile(absolutePath);
    const fileSizeMB = fileBuffer.length / (1024 * 1024);
    console.log(`  Uploading ${filePath} (${fileSizeMB.toFixed(2)} MB)...`);

    const blob = await put(blobPath, fileBuffer, {
      access: 'public',
      addRandomSuffix: false,
    });

    console.log(`  Uploaded to: ${blob.url}`);
    return blob.url;
  } catch (error) {
    console.error(`  Failed to upload ${filePath}:`, error);
    return null;
  }
}

async function migrateOrchards() {
  console.log('Starting orchard migration to Vercel Blob...\n');

  for (const orchard of existingOrchards) {
    console.log(`\nMigrating: ${orchard.name} (${orchard.id})`);
    console.log('─'.repeat(50));

    let orthoBlobUrl: string | null = null;
    let vectorBlobUrl: string | null = null;

    // Upload ortho PMTiles if it exists
    if (orchard.localOrthoPath) {
      orthoBlobUrl = await uploadFile(
        orchard.localOrthoPath,
        `orchards/${orchard.id}/ortho/orthomap.pmtiles`
      );
    }

    // Upload vector PMTiles if it exists
    if (orchard.localVectorPath) {
      vectorBlobUrl = await uploadFile(
        orchard.localVectorPath,
        `orchards/${orchard.id}/vector/trees.pmtiles`
      );
    }

    // Update database with full configuration
    try {
      // Check if orchard exists in database
      const existsResult = await sql`
        SELECT id FROM orchards WHERE id = ${orchard.id} LIMIT 1
      `;

      if (existsResult.rows.length === 0) {
        // Insert new record
        console.log('  Creating new database record...');
        await sql`
          INSERT INTO orchards (
            id, name, location, description,
            center_lat, center_lng,
            bounds_min_lng, bounds_min_lat, bounds_max_lng, bounds_max_lat,
            default_zoom, min_zoom, max_zoom, tile_min_zoom, tile_max_zoom,
            ortho_pmtiles_url, vector_pmtiles_url, ortho_api_path
          ) VALUES (
            ${orchard.id}, ${orchard.name}, ${orchard.location}, ${orchard.description},
            ${orchard.center.lat}, ${orchard.center.lng},
            ${orchard.bounds.minLng}, ${orchard.bounds.minLat},
            ${orchard.bounds.maxLng}, ${orchard.bounds.maxLat},
            ${orchard.defaultZoom}, ${orchard.minZoom}, ${orchard.maxZoom},
            ${orchard.tileMinZoom}, ${orchard.tileMaxZoom},
            ${orthoBlobUrl}, ${vectorBlobUrl}, ${(orchard as any).orthoApiPath || null}
          )
        `;
      } else {
        // Update existing record
        console.log('  Updating existing database record...');
        await sql`
          UPDATE orchards SET
            name = ${orchard.name},
            location = ${orchard.location},
            description = ${orchard.description},
            center_lat = ${orchard.center.lat},
            center_lng = ${orchard.center.lng},
            bounds_min_lng = ${orchard.bounds.minLng},
            bounds_min_lat = ${orchard.bounds.minLat},
            bounds_max_lng = ${orchard.bounds.maxLng},
            bounds_max_lat = ${orchard.bounds.maxLat},
            default_zoom = ${orchard.defaultZoom},
            min_zoom = ${orchard.minZoom},
            max_zoom = ${orchard.maxZoom},
            tile_min_zoom = ${orchard.tileMinZoom},
            tile_max_zoom = ${orchard.tileMaxZoom},
            ortho_pmtiles_url = ${orthoBlobUrl},
            vector_pmtiles_url = ${vectorBlobUrl},
            ortho_api_path = ${(orchard as any).orthoApiPath || null},
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ${orchard.id}
        `;
      }

      console.log('  Database updated successfully');
    } catch (error) {
      console.error('  Database update failed:', error);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('Migration complete!');
  console.log('\nNext steps:');
  console.log('1. Test the application to verify tiles load correctly');
  console.log('2. Once verified, you can remove the local tile files from git');
  console.log('3. Update .gitignore to exclude public/orchards/*/tiles/');
}

// Run migration
migrateOrchards().catch(console.error);
