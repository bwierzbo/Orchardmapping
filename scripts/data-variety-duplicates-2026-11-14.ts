/**
 * APPLIED 2026-11-14 — do not rerun; kept as the record.
 * Owner-approved (harvest schedule review, 2026-11-14): one entry per apple.
 *
 * Four varieties were in the library twice: the researched entry, under the
 * name the trees are planted as, and a low-confidence copy imported from
 * CiderPilot's variety list under another spelling. Each copy also produced
 * its own harvest targets, conflicting with the researched ones (Virginia
 * Hewe's Crab predicted 169 days from bloom against the WSU-measured 134).
 * The copies and their targets are removed; nothing else uses those names
 * (checked below, and the script refuses if anything does).
 *
 *   npx tsx --env-file=.env.local scripts/data-variety-duplicates-2026-11-14.ts            # plan
 *   npx tsx --env-file=.env.local scripts/data-variety-duplicates-2026-11-14.ts --apply
 */
import { sql } from '@vercel/postgres';

const APPLY = process.argv.includes('--apply');
const COPIES = [
  { drop: 'Amère de Berthecourt', keep: 'Amere de Berthcourt' },
  { drop: "Cox's Orange Pippin", keep: 'Cox Orange Pippin' },
  { drop: "Harry Masters' Jersey", keep: 'Harry Masters Jersey' },
  { drop: "Virginia Hewe's Crab", keep: 'Virginia Hewes Crab' },
];

async function main() {
  for (const { drop, keep } of COPIES) {
    const { rows: [use] } = await sql`
      SELECT (SELECT count(*) FROM trees WHERE variety = ${drop})::int AS trees,
             (SELECT count(*) FROM tree_grafts WHERE variety = ${drop})::int AS grafts,
             (SELECT count(*) FROM harvests WHERE variety = ${drop})::int AS harvests,
             (SELECT count(*) FROM phenology_marks WHERE variety = ${drop} OR scope_value = ${drop})::int AS marks,
             (SELECT count(*) FROM variety_observations WHERE variety = ${drop} OR scope_value = ${drop})::int AS observations,
             (SELECT count(*) FROM variety_attributes WHERE variety = ${drop})::int AS library,
             (SELECT count(*) FROM variety_harvest_targets WHERE variety = ${drop})::int AS targets,
             (SELECT count(*) FROM variety_attributes WHERE variety = ${keep})::int AS kept`;
    console.log(`${drop} -> kept "${keep}":`, use);
    if (use.trees + use.grafts + use.harvests + use.marks + use.observations > 0) throw new Error(`"${drop}" is still in use; not removing it`);
    if (use.kept !== 1) throw new Error(`no single library entry for "${keep}"`);
  }
  if (!APPLY) {
    console.log('plan only; pass --apply');
    return;
  }
  for (const { drop } of COPIES) {
    await sql`DELETE FROM variety_harvest_targets WHERE variety = ${drop}`;
    await sql`DELETE FROM variety_attributes WHERE variety = ${drop}`;
  }
  console.log(`✅ removed ${COPIES.length} duplicate library entries and their targets`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
