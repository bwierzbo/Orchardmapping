import { config } from 'dotenv';
config({ path: '.env.local' });

/**
 * One-time sync of the Home Orchard ("washington") to the authoritative
 * "Finn Haven Orchard" sheet in Finn Hall Orchard V1.xlsx.
 *
 * - Rows 1-12 × positions 1-6: overwrite variety/fruit_type/source/
 *   rootstock at each (row, position). Dot coordinates are untouched —
 *   the geometry was right, the labels were shifted.
 * - Row "X" (8 unnamed trees) is the espalier: renamed to "Rx" 1-8.
 * - Berry beds (sheet rows 26-28, east side) created as data-only
 *   records in rows "Berries 1" / "Berries 2" — drag them onto the
 *   map from the tree table when convenient.
 *
 * Variety names are normalized to Variety Library canon where certain
 * (Achmeads K → Ashmead's Kernel, Kingston → Kingston Black, Nieekyma
 * → Niedzwetzkyana, …). Nursery letters expand to full names.
 */

import { sql } from '@vercel/postgres';
import { bulkUpsertTrees, type BulkUpsertRow } from '../lib/db/trees';

type Entry = [
  row: string,
  position: string,
  variety: string,
  fruit: string,
  source?: string,
  rootstock?: string,
  notes?: string,
];

const T = 'Trees of Antiquity';
const V = 'Valley Nursery';
const O = 'One Green World';
const D = 'Dungeness';
const S = 'Stark Brothers';
const M = 'Mehrabyan';
const G = 'GrowOrganic';
const C = 'Cummins';
const R = 'Raintree';
const PO = 'Poulsbo';

const TREES: Entry[] = [
  // Row 1
  ['1', '1', 'Theta', 'hazelnut'],
  ['1', '2', 'Theta', 'hazelnut'],
  ['1', '3', 'Golden Transparent', 'plum', undefined, undefined, 'European plum'],
  ['1', '4', 'Italian Prune', 'plum'],
  ['1', '5', 'Giant Fuyu', 'persimmon'],
  ['1', '6', 'Mother', 'apple', T, 'M.111'],
  // Row 2
  ['2', '1', 'York', 'hazelnut', D],
  ['2', '2', 'Theta', 'hazelnut', S],
  ['2', '3', 'French Plum', 'plum'],
  ['2', '4', '6-Way Cherry', 'cherry', S],
  ['2', '5', 'Methley', 'plum', V, 'semi-dwarf'],
  // Row 2 P6 = raised garden (no tree)
  // Row 3
  ['3', '1', 'Du Chilly', 'hazelnut', V],
  ['3', '2', 'Theta', 'hazelnut', S],
  ['3', '3', 'Pomegranate', 'pomegranate'],
  ['3', '4', 'Lapins', 'cherry', V, 'Gisela'],
  ['3', '5', 'Satsuma', 'plum', V, 'semi-dwarf'],
  // Row 3 P6 = raised garden (no tree)
  // Row 4
  ['4', '1', 'Orcas', 'pear', D],
  ['4', '2', 'Rescue', 'pear', S],
  ['4', '3', 'Pomegranate', 'pomegranate'],
  ['4', '4', 'Rainier', 'cherry', V, 'Gisela'],
  ['4', '5', 'Smyrna', 'quince', V, 'semi-dwarf'],
  ['4', '6', 'Pineapple', 'quince', PO, 'BA 29C'],
  // Row 5 (apples)
  ['5', '1', 'Duchess of Oldenburg', 'apple', T, 'M.111'],
  ['5', '2', 'Karmijn de Sonnaville', 'apple', V, 'MM.106'],
  ['5', '3', 'Karmijn de Sonnaville', 'apple', V, 'MM.106'],
  ['5', '4', 'Mountain Rose', 'apple', O, 'M.7'],
  ['5', '5', 'Gravenstein', 'apple', V, 'MM.106'],
  ['5', '6', 'Gravenstein', 'apple', V, 'MM.106'],
  // Row 6
  ['6', '1', 'Finn', 'apple', undefined, 'M.26'],
  ['6', '2', 'Akane', 'apple', V, 'MM.106'],
  ['6', '3', "Cox's Orange Pippin", 'apple', O, 'M.7'],
  ['6', '4', "Cox's Orange Pippin", 'apple', O, 'M.7'],
  ['6', '5', 'Sops of Wine', 'apple', G, 'G.890'],
  ['6', '6', 'Reine des Reinettes', 'apple', T, 'M.111'],
  // Row 7
  ['7', '1', '3-Way Apple', 'apple', D, 'MM.106'],
  ['7', '2', 'Honeycrisp', 'apple', V, 'MM.106'],
  ['7', '3', 'Cosmic Crisp', 'apple', V, 'MM.106'],
  ['7', '4', 'Cosmic Crisp', 'apple', V, 'MM.106'],
  ['7', '5', 'Yarlington Mill', 'apple', T, 'M.111'],
  ['7', '6', 'Yarlington Mill', 'apple', T, 'M.111'],
  // Row 8
  ['8', '1', 'Bolero', 'apple', D, 'columnar'],
  ['8', '2', 'Liberty', 'apple', V, 'MM.106'],
  ['8', '3', 'Kingston Black', 'apple', O, 'M.7'],
  ['8', '4', 'Kingston Black', 'apple', O, 'M.7'],
  ['8', '5', 'Kingston Black', 'apple', T, 'M.111'],
  ['8', '6', 'Kingston Black', 'apple', T, 'M.111'],
  // Row 9
  ['9', '1', "Ashmead's Kernel", 'apple', V, 'MM.106'],
  ['9', '2', 'Enterprise', 'apple', V, 'MM.106'],
  ['9', '3', 'Jonagold', 'apple', V, 'MM.106'],
  ['9', '4', 'Jonagold', 'apple', V, 'MM.106'],
  ['9', '5', 'Dabinett', 'apple', T, 'M.111'],
  ['9', '6', 'Dabinett', 'apple', T, 'M.111'],
  // Row 10
  ['10', '1', 'Harrison', 'apple', C, 'G.890'],
  ['10', '2', 'Harrison', 'apple', C, 'G.890'],
  ['10', '3', 'Puget Spice', 'apple', R, 'MM.106'],
  ['10', '4', 'Puget Spice', 'apple', C, 'G.890'],
  ['10', '5', 'Golden Russet', 'apple', T, 'M.111'],
  ['10', '6', 'Golden Russet', 'apple', T, 'M.111'],
  // Row 11
  ['11', '1', 'Winter Red Flesh', 'apple', G, 'M.26'],
  ['11', '2', 'Cinnamon Spice', 'apple', T, 'M.111'],
  ['11', '3', 'Burford Red', 'apple', T, 'M.111'],
  ['11', '4', 'Redfield', 'apple', M, 'EMLA 111'],
  ['11', '5', 'Redfield', 'apple', M, 'EMLA 111'],
  ['11', '6', 'Geneva Crab', 'apple', M, 'EMLA 7'],
  // Row 12
  ['12', '1', 'Almata Sweet', 'apple'],
  ['12', '2', 'Unknown', 'apple'],
  ['12', '3', 'Niedzwetzkyana', 'apple', G, 'G.890', 'sheet: "Nieekyma"'],
  ['12', '4', 'Burford Red', 'apple', T, 'M.111'],
  ['12', '5', 'Redfield', 'apple', M, 'EMLA 111'],
  ['12', '6', 'Burford', 'apple', T, 'M.111'],
  // Berry beds (sheet rows 26-28, east side) — data-only records
  ['Berries 1', '1', 'Scarlet Ovation', 'huckleberry', undefined, undefined, '3 plants'],
  ['Berries 1', '2', 'Captivator', 'gooseberry'],
  ['Berries 1', '3', 'Chandler', 'blueberry', undefined, undefined, 'id uncertain (sheet has "?")'],
  ['Berries 1', '4', 'Red Currant', 'currant'],
  ['Berries 1', '5', 'Consort', 'currant', undefined, undefined, 'black currant'],
  ['Berries 1', '6', 'Crandall', 'currant', undefined, undefined, 'black currant'],
  ['Berries 1', '7', 'Duke', 'blueberry'],
  ['Berries 1', '8', 'Patriot', 'blueberry'],
  ['Berries 1', '9', 'Bluejay', 'blueberry'],
  ['Berries 2', '1', 'Old Bremerton', 'raspberry', undefined, undefined, '3 plants'],
  ['Berries 2', '2', 'Cascade Delight', 'raspberry'],
  ['Berries 2', '3', 'Cascade Delight', 'raspberry'],
  ['Berries 2', '4', 'Heritage', 'raspberry'],
  ['Berries 2', '5', 'Tulameen', 'raspberry'],
  ['Berries 2', '6', 'Bremerton', 'raspberry'],
  ['Berries 2', '7', 'Chester', 'blackberry'],
  ['Berries 2', '8', 'Arapaho', 'blackberry'],
  ['Berries 2', '9', "Hall's Beauty", 'blackberry'],
  ['Berries 2', '10', 'Triple Crown', 'blackberry'],
  ['Berries 2', '11', 'Prime-Ark Freedom', 'blackberry'],
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // 1. Espalier: row X (P3..P10, unnamed) becomes Rx 1-8 in map order
  const x = await sql`
    SELECT tree_id, position FROM trees
    WHERE orchard_id = 'washington' AND row_id = 'X'
    ORDER BY NULLIF(substring(position from '^\d+'), '')::int
  `;
  console.log(`Espalier: ${x.rows.length} trees in row X -> Rx 1-${x.rows.length}`);
  if (!dryRun) {
    let p = 1;
    for (const row of x.rows) {
      await sql`
        UPDATE trees SET row_id = 'Rx', position = ${String(p)}, updated_at = CURRENT_TIMESTAMP
        WHERE orchard_id = 'washington' AND tree_id = ${row.tree_id as string}
      `;
      p++;
    }
  }

  // 2. Grid + berries via the transactional bulk upsert
  const rows: BulkUpsertRow[] = TREES.map(([row_id, position, variety, fruit_type, source, rootstock, notes]) => ({
    row_id,
    position,
    variety,
    fruit_type,
    source,
    rootstock,
    notes,
  }));
  if (dryRun) {
    console.log(`DRY RUN: would upsert ${rows.length} rows`);
    return;
  }
  const result = await bulkUpsertTrees('washington', rows);
  console.log(`Upserted: ${result.created} created, ${result.updated} updated`);
  if (result.errors.length) console.log('Errors:', result.errors);
}

main().then(() => process.exit(0));
