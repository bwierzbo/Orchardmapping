#!/usr/bin/env node

/**
 * One-off: assign varieties to the 480 Finn Hall (1027) trees from the
 * owner's planting matrix (Sept 2026). Upsert keyed on (orchard, row,
 * position) — only the variety (and notes for row 8) are touched;
 * coordinates, status, etc. are preserved by the COALESCE upsert.
 *
 * Dry-run by default; pass --apply to write.
 * Usage: npx tsx scripts/import-finnhall-varieties.ts [--apply]
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const ORCHARD_ID = 'finn-hall';

/** [variety, count] runs per row, positions 1..32 in order. */
const ROWS: Record<string, Array<[string, number]>> = {
  '1': [['Cox Orange Pippin', 22], ['Virginia Hewes Crab', 10]],
  '2': [['Northern Spy', 11], ['Muscat de Bernay', 20], ['Chisel Jersey', 1]],
  '3': [['Yarlington Mill', 18], ['Arkansas Black', 11], ['Oxford Black', 1], ['Chisel Jersey', 2]],
  '4': [['Arkansas Black', 4], ['Yarlington Mill', 2], ['Arkansas Black', 6], ['Golden Russet', 20]],
  '5': [
    ['Unknown', 2], ['Braeburn', 2], ['Whitney Crab', 1], ['Amere de Berthcourt', 1],
    ['Harry Masters Jersey', 2], ["Ashmead's Kernel", 2], ['Cimetere', 1], ['Michelin', 2],
    ["Tremlett's Bitter", 1], ['Sweet Choppin', 2], ['Tompkins King', 2], ['Unknown', 1],
    ['Lambrook Pippin', 1], ['Belle de Jardin', 2], ['Champlain', 2], ['Nehou', 2],
    ['Red Vein Crab', 2], ['Redfield', 2], ['Isle of Wight', 2],
  ],
  '6': [['Stoke Red', 32]],
  '7': [['Harrison', 32]],
  '8': [['Dabinette', 32]],
  '9': [['Harrison', 32]],
  '10': [['Harrison', 32]],
  '11': [['Kingston Black', 32]],
  '12': [['Kingston Black', 32]],
  '13': [['Kingston Black', 32]],
  '14': [['Brown Snout', 32]],
  '15': [['Brown Snout', 9], ['Kingston Black', 3], ['Fake Puget Spice', 10], ['Antonovka', 10]],
};

async function main() {
  const apply = process.argv.includes('--apply');

  const rows: Array<{ row_id: string; position: number; variety: string; notes?: string }> = [];
  for (const [rowId, runs] of Object.entries(ROWS)) {
    let position = 1;
    for (const [variety, count] of runs) {
      for (let i = 0; i < count; i++) {
        rows.push({
          row_id: rowId,
          position,
          variety,
          // Row 8 Dabinettes are on G-935 rootstock — notes until a
          // dedicated rootstock column exists.
          ...(rowId === '8' ? { notes: 'Rootstock: G-935' } : {}),
        });
        position++;
      }
    }
    if (position - 1 !== 32) {
      throw new Error(`Row ${rowId} has ${position - 1} trees, expected 32`);
    }
  }
  console.log(`Prepared ${rows.length} tree variety assignments.`);

  const varietyCounts = new Map<string, number>();
  for (const r of rows) varietyCounts.set(r.variety, (varietyCounts.get(r.variety) ?? 0) + 1);
  for (const [v, n] of [...varietyCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)} × ${v}`);
  }

  if (!apply) {
    console.log('\nDry run — pass --apply to write to the database.');
    process.exit(0);
  }

  const { bulkUpsertTrees } = await import('../lib/db/trees');
  const result = await bulkUpsertTrees(ORCHARD_ID, rows);
  console.log(`\n✅ Done: ${result.created} created, ${result.updated} updated.`);
  if (result.errors.length) {
    console.error('Errors:', result.errors);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
