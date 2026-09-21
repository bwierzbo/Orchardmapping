/**
 * Import trees into an orchard from a CSV or JSON file.
 *
 * Usage:
 *   npx tsx scripts/import-trees.ts <orchard-id> <file.csv|file.json> [--dry-run]
 *
 * Rows are matched the same way the in-app importer matches them: by
 * tree_id when the file carries one (an export round-trip does), otherwise
 * by address. Matched rows are updated in place, unmatched rows become new
 * trees with freshly issued permanent ids. Blank cells leave existing
 * values alone, so a sparse file cannot wipe data it does not mention.
 *
 * This replaces the three hand-rolled importers that each generated
 * tree_ids their own way -- ids are issued by the database now, and a
 * script that invents one would break the scheme.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFile } from 'fs/promises';
import { parseTreeCSVText } from '../lib/csv-parser';
import { bulkUpsertTrees, type BulkUpsertRow } from '../lib/db/trees';
import { formatAddress } from '../lib/address';
import { sql } from '@vercel/postgres';

async function main() {
  const [orchardId, file] = process.argv.slice(2);
  const dryRun = process.argv.includes('--dry-run');

  if (!orchardId || !file) {
    console.error('Usage: npx tsx scripts/import-trees.ts <orchard-id> <file.csv|file.json> [--dry-run]');
    process.exit(1);
  }

  const { rows: orchards } = await sql`SELECT id, name FROM orchards WHERE id = ${orchardId}`;
  if (orchards.length === 0) {
    console.error(`No orchard "${orchardId}". Known orchards:`);
    const { rows: all } = await sql`SELECT id, name FROM orchards ORDER BY id`;
    for (const o of all) console.error(`  ${o.id}  (${o.name})`);
    process.exit(1);
  }

  const text = await readFile(file, 'utf-8');
  let data: BulkUpsertRow[];

  if (/\.json$/i.test(file)) {
    const parsed = JSON.parse(text);
    data = Array.isArray(parsed) ? parsed : parsed.trees;
    if (!Array.isArray(data)) {
      console.error('JSON must be an array of trees, or { "trees": [...] }');
      process.exit(1);
    }
  } else {
    const result = parseTreeCSVText(text);
    for (const w of result.warnings) console.warn(`warning: ${w}`);
    if (!result.success) {
      console.error(`${result.errors.length} problem(s):`);
      for (const e of result.errors.slice(0, 20)) console.error(`  ${e}`);
      process.exit(1);
    }
    data = result.data;
  }

  console.log(`${data.length} row(s) from ${file} -> ${orchards[0].name}`);
  if (dryRun) {
    for (const row of data.slice(0, 10)) {
      console.log(`  ${row.tree_id ?? '(new)'}  ${formatAddress(row)}  ${row.variety ?? ''}`);
    }
    if (data.length > 10) console.log(`  ... and ${data.length - 10} more`);
    console.log('Dry run: nothing written.');
    return;
  }

  const result = await bulkUpsertTrees(orchardId, data);
  if (result.errors.length > 0) {
    console.error(`Import rejected, nothing written:`);
    for (const e of result.errors) console.error(`  ${e.address}: ${e.error}`);
    process.exit(1);
  }
  console.log(`Done: ${result.created} created, ${result.updated} updated.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .then(() => process.exit(0));
