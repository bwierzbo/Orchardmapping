#!/usr/bin/env node

/**
 * One-off: Husmann provenance for the row-5 sampler + Chisel Jerseys —
 * source "Mike Husmann", planted 2021-03-25, for the 14 matched
 * varieties. Rootstock intentionally NOT set (awaiting owner
 * confirmation of "ELMA 06" vs EMLA 106).
 *
 * Run: npx tsx scripts/backfill-husmann.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const HUSMANN = [
  'Isle of Wight',
  'Nehou',
  'Chisel Jersey',
  'Champlain',
  'Belle de Jardin',
  'Oxford Black',
  'Redfield',
  "Ashmead's Kernel",
  'Michelin',
  'Sweet Choppin',
  'Tompkins King',
  'Red Vein Crab',
  'Cimetere',
  'Lambrook Pippin',
];

async function main() {
  const apply = process.argv.includes('--apply');
  const { applyGroupAction, resolveGroup } = await import('../lib/db/group-actions');

  const trees = await resolveGroup('finn-hall', { varieties: HUSMANN });
  console.log(`Husmann: ${trees.length} trees match ${HUSMANN.length} varieties`);
  if (!apply) {
    console.log('Dry run — pass --apply to write.');
    process.exit(0);
  }

  for (const [field, value] of [
    ['source', 'Mike Husmann'],
    ['planted_date', '2021-03-25'],
  ] as const) {
    const r = await applyGroupAction(
      'finn-hall',
      { varieties: HUSMANN },
      { kind: 'set_field', field, value },
      'backfill:provenance-2026-09'
    );
    console.log(`  set ${field}=${value}: ${r.treeCount} trees (group #${r.groupId})`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
