#!/usr/bin/env node

/**
 * One-off: backfill Finn Hall provenance from the owner's original
 * planting spreadsheet (Sept 2026) and seed variety_attributes.
 *
 * - Cummins Nursery trees (G.890): Kingston Black, Harrison, Brown
 *   Snout, Stoke Red — source + rootstock (planting date pending
 *   owner confirmation of 2 vs 22 April 2021).
 * - Trees of Antiquity (M.111): Cox Orange Pippin, Virginia Hewes Crab,
 *   Northern Spy, Muscat de Bernay, Yarlington Mill, Arkansas Black,
 *   Golden Russet — source + rootstock + planted 2021-03-25.
 * - variety_attributes seeded with cider type, origin, bloom group
 *   (1 early … 5 late), ripening offset vs McIntosh (Sep 15).
 *
 * Uses the group-action engine so every write is audited and undoable.
 * Run: npx tsx scripts/backfill-provenance.ts [--apply]
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const ORCHARD = 'finn-hall';
const USER = 'backfill:provenance-2026-09';

const CUMMINS = ['Kingston Black', 'Harrison', 'Brown Snout', 'Stoke Red'];
const TOA = [
  'Cox Orange Pippin',
  'Virginia Hewes Crab',
  'Northern Spy',
  'Muscat de Bernay',
  'Yarlington Mill',
  'Arkansas Black',
  'Golden Russet',
];

const VARIETY_ATTRS: Array<
  [string, string, string, number, number, string, string | null]
> = [
  // variety, type, origin, bloom, offset, hint, pollinator
  ['Kingston Black', 'BSH', 'England', 3, 0, 'Sep 15', 'Harrison'],
  ['Harrison', 'SH', 'USA - Heritage', 3, 35, 'Oct 20', 'Kingston Black'],
  ['Brown Snout', 'BSW', 'England', 5, 42, 'Oct 27', 'Kingston Black'],
  ['Stoke Red', 'BSH', 'England', 5, 49, 'Nov 03', 'Kingston Black'],
  ['Cox Orange Pippin', 'SH', 'England', 3, 0, 'Sep 15', null],
  ['Virginia Hewes Crab', 'BSH', 'USA - Heritage', 3, 0, 'Sep 15', null],
  ['Northern Spy', 'SH', 'USA - Heritage', 5, 30, 'Oct 15', null],
  ['Muscat de Bernay', 'BSW', 'France', 2, 35, 'Oct 20', null],
  ['Yarlington Mill', 'BSW', 'England', 3, 35, 'Oct 20', null],
  ['Arkansas Black', 'SW', 'USA - Heritage', 3, 49, 'Nov 03', null],
  ['Golden Russet', 'SH', 'USA - Heritage', 2, 49, 'Nov 03', null],
];

async function main() {
  const apply = process.argv.includes('--apply');
  const { applyGroupAction, resolveGroup } = await import('../lib/db/group-actions');
  const { sql } = await import('@vercel/postgres');

  for (const [label, varieties] of [
    ['Cummins', CUMMINS],
    ['Trees of Antiquity', TOA],
  ] as const) {
    const trees = await resolveGroup(ORCHARD, { varieties: [...varieties] });
    console.log(`${label}: ${trees.length} trees match (${varieties.join(', ')})`);
  }

  if (!apply) {
    console.log('\nDry run — pass --apply to write.');
    process.exit(0);
  }

  const run = async (
    varieties: string[],
    field: string,
    value: string,
  ) => {
    const r = await applyGroupAction(
      ORCHARD,
      { varieties },
      { kind: 'set_field', field, value },
      USER
    );
    console.log(`  set ${field}=${value}: ${r.treeCount} trees (group #${r.groupId})`);
  };

  console.log('Cummins Nursery (G.890):');
  await run(CUMMINS, 'source', 'Cummins Nursery');
  await run(CUMMINS, 'rootstock', 'G.890');

  console.log('Trees of Antiquity (M.111):');
  await run(TOA, 'source', 'Trees of Antiquity');
  await run(TOA, 'rootstock', 'M.111');
  await run(TOA, 'planted_date', '2021-03-25');

  const { sql: q } = { sql };
  console.log('Seeding variety_attributes…');
  for (const [variety, type, origin, bloom, offset, hint, pollinator] of VARIETY_ATTRS) {
    await q`
      INSERT INTO variety_attributes (variety, cider_type, origin, bloom_group, ripen_offset_days, ripen_hint, pollinator)
      VALUES (${variety}, ${type}, ${origin}, ${bloom}, ${offset}, ${hint}, ${pollinator})
      ON CONFLICT (variety) DO UPDATE SET
        cider_type = EXCLUDED.cider_type,
        origin = EXCLUDED.origin,
        bloom_group = EXCLUDED.bloom_group,
        ripen_offset_days = EXCLUDED.ripen_offset_days,
        ripen_hint = EXCLUDED.ripen_hint,
        pollinator = EXCLUDED.pollinator,
        updated_at = NOW()
    `;
  }
  console.log(`✅ ${VARIETY_ATTRS.length} variety_attributes rows seeded.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
