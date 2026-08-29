/**
 * Upload the repaired Many Trees PMTiles to Vercel Blob and (with --apply)
 * point the manytrees orchard row at it.
 *
 * Usage:
 *   pnpm tsx scripts/upload-manytrees.ts --file <path-to-fixed.pmtiles>            # upload + dry-run SQL
 *   pnpm tsx scripts/upload-manytrees.ts --file <path> --apply                     # upload + update DB
 *   pnpm tsx scripts/upload-manytrees.ts --url <existing-blob-url> [--apply]       # skip upload
 *
 * Default is a dry run: it uploads (or reuses) the blob, validates it,
 * and prints the UPDATE it would run. Nothing touches the orchards row
 * without --apply.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { sql } from '@vercel/postgres';
import * as fs from 'fs/promises';
import { uploadPMTilesToBlob } from '../lib/blob/upload';
import { validatePMTilesFromUrl } from '../lib/pmtiles/validate';

const ORCHARD_ID = 'manytrees';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const filePath = arg('file');
  const existingUrl = arg('url');
  const apply = process.argv.includes('--apply');

  let url: string;
  if (existingUrl) {
    url = existingUrl;
    console.log(`Reusing blob: ${url}`);
  } else if (filePath) {
    const stat = await fs.stat(filePath);
    console.log(`Uploading ${filePath} (${(stat.size / 1024 / 1024).toFixed(1)} MB) ...`);
    const buffer = await fs.readFile(filePath);
    const result = await uploadPMTilesToBlob(ORCHARD_ID, buffer, 'manytrees.pmtiles', 'ortho', {
      multipart: true,
    });
    url = result.url;
    console.log(`Uploaded: ${url}`);
  } else {
    console.error('Pass --file <path> or --url <blob-url>');
    process.exit(1);
  }

  console.log('Validating PMTiles header from URL ...');
  const validation = await validatePMTilesFromUrl(url);
  if (!validation.valid || !validation.metadata) {
    console.error('Validation failed:', validation.error);
    process.exit(1);
  }
  const m = validation.metadata;
  console.log(
    `  bounds: ${m.bounds.minLng.toFixed(6)},${m.bounds.minLat.toFixed(6)} -> ` +
      `${m.bounds.maxLng.toFixed(6)},${m.bounds.maxLat.toFixed(6)}`
  );
  console.log(`  center: ${m.center.lng.toFixed(6)},${m.center.lat.toFixed(6)}`);
  console.log(`  zooms: ${m.minZoom}-${m.tileMaxZoom} (display max ${m.maxZoom}), type: ${m.tileType}`);
  if (validation.warnings) validation.warnings.forEach((w) => console.log(`  warning: ${w}`));

  const values = {
    ortho_pmtiles_url: url,
    ortho_api_path: null as string | null,
    bounds_min_lng: m.bounds.minLng,
    bounds_min_lat: m.bounds.minLat,
    bounds_max_lng: m.bounds.maxLng,
    bounds_max_lat: m.bounds.maxLat,
    center_lng: m.center.lng,
    center_lat: m.center.lat,
    tile_min_zoom: Math.round(m.minZoom),
    tile_max_zoom: Math.min(m.tileMaxZoom, 23),
    max_zoom: m.maxZoom,
  };

  console.log(`\nUPDATE orchards SET`);
  for (const [k, v] of Object.entries(values)) {
    console.log(`  ${k} = ${v === null ? 'NULL' : typeof v === 'string' ? `'${v}'` : v},`);
  }
  console.log(`  updated_at = CURRENT_TIMESTAMP\nWHERE id = '${ORCHARD_ID}';`);

  if (!apply) {
    console.log('\nDry run (no DB changes). Re-run with --apply to update the orchard row.');
    process.exit(0);
  }

  const result = await sql`
    UPDATE orchards SET
      ortho_pmtiles_url = ${values.ortho_pmtiles_url},
      ortho_api_path = NULL,
      bounds_min_lng = ${values.bounds_min_lng},
      bounds_min_lat = ${values.bounds_min_lat},
      bounds_max_lng = ${values.bounds_max_lng},
      bounds_max_lat = ${values.bounds_max_lat},
      center_lng = ${values.center_lng},
      center_lat = ${values.center_lat},
      tile_min_zoom = ${values.tile_min_zoom},
      tile_max_zoom = ${values.tile_max_zoom},
      max_zoom = ${values.max_zoom},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${ORCHARD_ID}
    RETURNING id, ortho_pmtiles_url
  `;
  if (result.rows.length === 0) {
    console.error(`No orchard row with id '${ORCHARD_ID}' — nothing updated.`);
    process.exit(1);
  }
  console.log(`\nApplied. ${result.rows[0].id} -> ${result.rows[0].ortho_pmtiles_url}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
