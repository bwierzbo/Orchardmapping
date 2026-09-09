#!/usr/bin/env node

/**
 * One-off: provenance round 2 (owner answers, Sept 2026):
 * - Cummins varieties planted 2021-04-22 (confirmed 22 April)
 * - Fake Puget Spice: source Raintree Nursery, planted 2021-04-22
 * - Antonovka: planted 2021-04-22 (source still unknown)
 * Run: npx tsx scripts/backfill-provenance-2.ts --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const CUMMINS = ['Kingston Black', 'Harrison', 'Brown Snout', 'Stoke Red'];

async function main() {
  const apply = process.argv.includes('--apply');
  const { applyGroupAction } = await import('../lib/db/group-actions');
  if (!apply) {
    console.log('Dry run — pass --apply to write.');
    process.exit(0);
  }
  const user = 'backfill:provenance-2026-09';
  const steps: Array<[string[], string, string]> = [
    [CUMMINS, 'planted_date', '2021-04-22'],
    [['Fake Puget Spice'], 'source', 'Raintree Nursery'],
    [['Fake Puget Spice'], 'planted_date', '2021-04-22'],
    [['Antonovka'], 'planted_date', '2021-04-22'],
  ];
  for (const [varieties, field, value] of steps) {
    const r = await applyGroupAction(
      'finn-hall',
      { varieties },
      { kind: 'set_field', field, value },
      user
    );
    console.log(`  ${varieties.join('/')}: ${field}=${value} → ${r.treeCount} trees (group #${r.groupId})`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
