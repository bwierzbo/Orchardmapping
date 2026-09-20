import { config } from 'dotenv';
config({ path: '.env.local' });

/**
 * Does the program address what the library says is here?
 *
 *   npx tsx scripts/check-program-coverage.ts [orchard-id]
 *
 * Exits non-zero when a pest the library rates high or moderate has no
 * active step and no written reason in DELIBERATELY_UNTREATED. Run it
 * after seeding or editing program steps — this is the check that would
 * have caught leafrollers having no step for the whole of phase 3.
 */
import { sql } from '@vercel/postgres';
import { listProgramSteps } from '../lib/db/program';
import { listMaterials } from '../lib/db/spray';
import { findCoverageGaps } from '../lib/program-coverage';

const ORCHARD = process.argv[2] ?? 'finn-hall';

async function main() {
  const { rows: pests } = await sql`
    SELECT key, name, category, prevalence FROM pest_library ORDER BY sort_order`;
  const [steps, materials] = await Promise.all([listProgramSteps(ORCHARD), listMaterials()]);

  const gaps = findCoverageGaps({
    pests: pests.map((p) => ({
      key: String(p.key),
      name: String(p.name),
      category: String(p.category),
      prevalence: String(p.prevalence),
    })),
    steps,
    materials,
  });

  console.log(`${ORCHARD}: ${steps.length} active steps against ${pests.length} catalogued pests`);
  if (gaps.length === 0) {
    console.log('✓ every high- and moderate-prevalence pest has a step or a written reason');
    process.exit(0);
  }

  console.log(`\n✗ ${gaps.length} uncovered:`);
  for (const g of gaps) {
    const mats = g.availableMaterials.length
      ? `${g.hasUnusedMaterial ? 'UNUSED material available: ' : 'materials: '}${g.availableMaterials.join(', ')}`
      : 'nothing in the library treats it';
    console.log(`  ${g.prevalence.padEnd(9)} ${g.name.padEnd(26)} ${mats}`);
  }
  console.log('\nEither add a step, or add the reason to DELIBERATELY_UNTREATED.');
  process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
