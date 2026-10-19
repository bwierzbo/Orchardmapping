/**
 * One-off (2026-10-18): owner-supplied sequence for Mantooth. Each block's
 * row 0 runs clockwise from P1:
 *
 *   North: Tompkins King, Winter Banana, Discovery, Chehalis, Granny Smith
 *   South: Criterion, Fuji, unknown pear, Fuji, Red Gala, unknown
 *
 * The positions were entered as 1, 7, 8, 9, 10 in North and the South trees
 * all carried the variety (and some the species) of the tree placed before
 * them. TA-003-0008 and -0009 were placed on the same GPS fix as -0007 and
 * are not in the owner's list of six South trees, so they are removed.
 *
 * Goes through updateTree/deleteTree and writes the same tree_events the
 * API does, so each tree's history shows the correction.
 *
 *   npx tsx scripts/fix-mantooth-sequence-2026-10.ts [--apply]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const OWNER = 'user_3JYcxoMuyUgYkqCOk1zy3suAUWO';
const REASON = 'Owner-supplied sequence, 2026-10-18';

type Patch = { position?: string; variety?: string | null; fruit_type?: string | null };

// Ordered so no step lands on an address another tree still holds.
const DELETES = ['TA-003-0008', 'TA-003-0009'];
const UPDATES: Array<[string, Patch]> = [
  ['TA-003-0002', { position: '2' }],
  ['TA-003-0003', { position: '3' }],
  ['TA-003-0004', { position: '4' }],
  ['TA-003-0005', { position: '5' }],
  ['TA-003-0010', { position: '3', variety: null, fruit_type: 'pear' }],
  ['TA-003-0011', { position: '4', variety: 'Fuji', fruit_type: 'apple' }],
  ['TA-003-0012', { position: '5', variety: 'Red Gala', fruit_type: 'apple' }],
  ['TA-003-0013', { position: '6', variety: null, fruit_type: null }],
];

async function main() {
  const apply = process.argv.includes('--apply');
  const { getTreeById, updateTree, deleteTree } = await import('../lib/db/trees');
  const { insertTreeEvent, diffTreeChanges } = await import('../lib/db/tree-events');
  const { serializeTree } = await import('../lib/serialize');

  for (const id of DELETES) {
    const before = await getTreeById(id);
    if (!before) {
      console.log(`[skip] ${id} already gone`);
      continue;
    }
    console.log(`[delete] ${id} ${before.variety} at ${before.block_id} R${before.row_id} P${before.position}`);
    if (!apply) continue;
    await deleteTree(id);
    await insertTreeEvent({
      tree_id: id,
      orchard_id: before.orchard_id,
      event_type: 'deleted',
      detail: `Duplicate placement removed. ${REASON}`,
      changes: { snapshot: serializeTree(before) },
      created_by: OWNER,
    });
  }

  for (const [id, patch] of UPDATES) {
    const before = await getTreeById(id);
    if (!before) throw new Error(`${id} not found`);
    const changes = diffTreeChanges(before as unknown as Record<string, unknown>, patch);
    if (Object.keys(changes).length === 0) {
      console.log(`[same] ${id}`);
      continue;
    }
    console.log(`[update] ${id}`, JSON.stringify(changes));
    if (!apply) continue;
    await updateTree(id, patch);
    await insertTreeEvent({
      tree_id: id,
      orchard_id: before.orchard_id,
      event_type: 'updated',
      detail: REASON,
      changes,
      created_by: OWNER,
    });
  }

  if (!apply) console.log('\nDry run. Re-run with --apply to write.');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
