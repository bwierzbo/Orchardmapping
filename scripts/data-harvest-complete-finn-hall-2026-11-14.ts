/**
 * APPLIED 2026-11-14 — do not rerun; kept as the record.
 * Owner, 2026-11-14: the 2026 harvest at Olympic Bluffs Cidery (finn-hall)
 * is complete on every tree except Harrison and Brown Snout, which are
 * still being picked. Each standing tree not already picked out this year
 * is closed the way its panel's "Harvest complete" does it: the date on the
 * tree and a harvest_complete event in its history. No tree here carries a
 * graft, so whole-tree completion is right (checked below; refuses if not).
 *
 *   npx tsx --env-file=.env.local scripts/data-harvest-complete-finn-hall-2026-11-14.ts            # plan
 *   npx tsx --env-file=.env.local scripts/data-harvest-complete-finn-hall-2026-11-14.ts --apply
 */
import { sql } from '@vercel/postgres';
import { setTreeHarvestCompletedOn } from '../lib/db/tree-harvests';
import { insertTreeEvent } from '../lib/db/tree-events';

const ORCHARD = 'finn-hall';
const DATE = '2026-11-14';
const STILL_PICKING = ['harrison', 'brown snout'];
const APPLY = process.argv.includes('--apply');

async function main() {
  const { rows: grafted } = await sql`
    SELECT count(*)::int AS n FROM tree_grafts g JOIN trees t ON t.tree_id = g.tree_id
    WHERE t.orchard_id = ${ORCHARD} AND t.removed_on IS NULL AND g.status = 'growing'`;
  if (grafted[0].n > 0) throw new Error('grafted trees present: close them by variety instead');

  const { rows } = await sql`
    SELECT tree_id, variety FROM trees
    WHERE orchard_id = ${ORCHARD} AND removed_on IS NULL
      AND lower(btrim(COALESCE(variety, ''))) <> ALL(${STILL_PICKING as unknown as string})
      AND (harvest_completed_on IS NULL OR harvest_completed_on < '2026-01-01')
    ORDER BY tree_id`;
  const byVariety = new Map<string, number>();
  for (const r of rows) byVariety.set(String(r.variety), (byVariety.get(String(r.variety)) ?? 0) + 1);
  console.log(`${rows.length} trees to close:`, Object.fromEntries(byVariety));
  if (!APPLY) {
    console.log('plan only; pass --apply');
    return;
  }
  for (const r of rows) {
    await setTreeHarvestCompletedOn(String(r.tree_id), DATE);
    await insertTreeEvent({
      tree_id: String(r.tree_id),
      orchard_id: ORCHARD,
      event_type: 'harvest_complete',
      event_date: DATE,
      detail: 'Picked out for 2026',
      changes: { harvest_completed_on: { from: null, to: DATE } },
      created_by: 'owner-request:2026-11-14',
    });
  }
  console.log(`✅ closed ${rows.length} trees`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
