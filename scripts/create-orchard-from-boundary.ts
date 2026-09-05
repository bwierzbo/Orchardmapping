/**
 * Create (or update) an orchard from a traced boundary, no flight required.
 *
 * The normal path to a new orchard is "Add New Orchard" in the UI, which
 * needs a PMTiles orthomosaic. This script covers the case before that:
 * an orchard whose footprint has been traced from aerial imagery, so
 * trees can be placed against a real outline while the survey is pending.
 * Dropping an orthomosaic in later is an ordinary update — the boundary
 * stays, and the viewer switches from a filled block to an outline.
 *
 * Input is a single GeoJSON Feature whose properties carry the orchard
 * metadata and whose geometry is the boundary; see
 * data/orchards/finn-hall.geojson. Centre, bounds and default zoom are
 * derived from the geometry.
 *
 * Usage:
 *   npx tsx scripts/create-orchard-from-boundary.ts <file.geojson>
 *   npx tsx scripts/create-orchard-from-boundary.ts <file.geojson> --dry-run
 *   npx tsx scripts/create-orchard-from-boundary.ts <file.geojson> --update
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  parseBoundary,
  boundaryBounds,
  boundaryCenter,
  zoomForBounds,
} from '../lib/orchard-boundary';
import {
  getOrchardById,
  insertOrchardFull,
  orchardExists,
  updateOrchard,
} from '../lib/db/orchards';

interface BoundaryFileProperties {
  id?: string;
  name?: string;
  location?: string;
  description?: string;
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const allowUpdate = args.includes('--update');
  const file = args.find((a) => !a.startsWith('--'));

  if (!file) {
    fail('Usage: npx tsx scripts/create-orchard-from-boundary.ts <file.geojson> [--update] [--dry-run]');
  }

  const raw = await fs.readFile(path.resolve(file), 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail(`${file} is not valid JSON: ${(error as Error).message}`);
  }

  const boundary = parseBoundary(parsed);
  if (!boundary) {
    fail(`${file} does not contain a GeoJSON Polygon (or a Feature wrapping one)`);
  }

  const properties = ((parsed as { properties?: BoundaryFileProperties }).properties ??
    {}) as BoundaryFileProperties;
  const { id, name, location } = properties;
  if (!id || !name || !location) {
    fail(`${file} properties must include "id", "name" and "location"`);
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    fail(`Orchard id "${id}" must be lowercase letters, digits and hyphens`);
  }

  const bounds = boundaryBounds(boundary);
  const [centerLng, centerLat] = boundaryCenter(boundary);
  const defaultZoom = Number(zoomForBounds(bounds).toFixed(2));

  console.log(`Orchard:  ${name} (${id})`);
  console.log(`Location: ${location}`);
  console.log(`Centre:   ${centerLat.toFixed(6)}, ${centerLng.toFixed(6)}`);
  console.log(
    `Bounds:   ${bounds.minLat.toFixed(6)}..${bounds.maxLat.toFixed(6)}, ` +
      `${bounds.minLng.toFixed(6)}..${bounds.maxLng.toFixed(6)}`
  );
  console.log(`Zoom:     ${defaultZoom} (fitted to the boundary)`);
  console.log(`Ring:     ${boundary.coordinates[0].length} positions`);

  if (dryRun) {
    console.log('\n(dry run — nothing written)');
    return;
  }

  const exists = await orchardExists(id);
  if (exists && !allowUpdate) {
    fail(`Orchard "${id}" already exists. Re-run with --update to replace its boundary.`);
  }

  if (exists) {
    // Keep whatever imagery the orchard already has; only re-fit the
    // geography to the new boundary.
    const before = await getOrchardById(id);
    await updateOrchard(id, {
      name,
      location,
      description: properties.description,
      center_lat: centerLat,
      center_lng: centerLng,
      bounds_min_lng: bounds.minLng,
      bounds_min_lat: bounds.minLat,
      bounds_max_lng: bounds.maxLng,
      bounds_max_lat: bounds.maxLat,
      // JSONB: hand Postgres a JSON string, not a JS object
      boundary_geojson: JSON.stringify(boundary),
    });
    console.log(
      `\n✓ Updated "${id}"${before?.ortho_pmtiles_url ? ' (existing orthomosaic kept)' : ''}`
    );
    return;
  }

  await insertOrchardFull({
    id,
    name,
    location,
    description: properties.description,
    center_lat: centerLat,
    center_lng: centerLng,
    bounds_min_lng: bounds.minLng,
    bounds_min_lat: bounds.minLat,
    bounds_max_lng: bounds.maxLng,
    bounds_max_lat: bounds.maxLat,
    default_zoom: defaultZoom,
    boundary,
  });

  console.log(`\n✓ Created "${id}" — open /orchard/${id} and place trees inside the boundary`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
