/**
 * Fill an orchard's boundary with a regular planting grid.
 *
 * For a block whose layout is known but whose individual trees cannot be
 * resolved from available imagery: lay down rows x positions trees at
 * even spacing inside the traced boundary, so varieties, dates and notes
 * have something to attach to. Positions are by design, not observation —
 * nudge them on the map once a drone survey lands.
 *
 * Existing trees at the same row/position are updated, not duplicated
 * (the bulk upsert keys on orchard_id + row_id + position).
 *
 * Usage:
 *   npx tsx scripts/generate-tree-grid.ts <orchard-id> <rows> <positions> --dry-run
 *   npx tsx scripts/generate-tree-grid.ts <orchard-id> <rows> <positions>
 *   npx tsx scripts/generate-tree-grid.ts <orchard-id> <rows> <positions> --geojson out.json
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import * as fs from 'fs/promises';
import { getOrchardById } from '../lib/db/orchards';
import { parseBoundary } from '../lib/orchard-boundary';
import { generateTreeGrid } from '../lib/tree-grid';
import { bulkUpsertTrees } from '../lib/db/trees';

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const geojsonAt = args.indexOf('--geojson');
  const geojsonOut = geojsonAt >= 0 ? args[geojsonAt + 1] : null;

  const [orchardId, rowsRaw, positionsRaw] = positional;
  if (!orchardId || !rowsRaw || !positionsRaw) {
    console.error('Usage: tsx scripts/generate-tree-grid.ts <orchard-id> <rows> <positions> [--dry-run]');
    process.exit(1);
  }
  const rows = parseInt(rowsRaw, 10);
  const positions = parseInt(positionsRaw, 10);

  const orchard = await getOrchardById(orchardId);
  if (!orchard) {
    console.error(`No orchard "${orchardId}".`);
    process.exit(1);
  }
  const boundary = parseBoundary(orchard.boundary_geojson);
  if (!boundary) {
    console.error(`Orchard "${orchardId}" has no boundary to fill.`);
    process.exit(1);
  }

  const plan = generateTreeGrid(boundary, rows, positions);
  console.log(`Orchard:  ${orchard.name} (${orchardId})`);
  console.log(`Grid:     ${plan.rows} rows x ${plan.positions} positions = ${plan.trees.length} trees`);
  console.log(`Rows run: ${plan.rowAxis}`);
  console.log(`Spacing:  ${plan.rowSpacingM.toFixed(2)} m between rows, ${plan.treeSpacingM.toFixed(2)} m between trees`);
  console.log(`Corners:  R1P1 ${plan.trees[0].lat.toFixed(6)}, ${plan.trees[0].lng.toFixed(6)}`);
  const last = plan.trees[plan.trees.length - 1];
  console.log(`          R${plan.rows}P${plan.positions} ${last.lat.toFixed(6)}, ${last.lng.toFixed(6)}`);

  if (geojsonOut) {
    await fs.writeFile(
      geojsonOut,
      JSON.stringify(
        {
          type: 'FeatureCollection',
          features: plan.trees.map((t) => ({
            type: 'Feature',
            properties: { row_id: t.row_id, position: t.position },
            geometry: { type: 'Point', coordinates: [t.lng, t.lat] },
          })),
        },
        null,
        1
      )
    );
    console.log(`Wrote ${geojsonOut}`);
  }

  if (dryRun) {
    console.log('\n(dry run — nothing written)');
    process.exit(0);
  }

  const result = await bulkUpsertTrees(
    orchardId,
    plan.trees.map((t) => ({
      row_id: t.row_id,
      position: t.position,
      lat: t.lat,
      lng: t.lng,
      status: 'unknown',
    }))
  );
  console.log(`\n✓ ${result.created} created, ${result.updated} updated`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
