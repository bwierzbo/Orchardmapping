#!/usr/bin/env node
/**
 * Seed the researched picking windows from lib/data/harvest-reference.ts.
 *
 * Writes two things: the window in words onto the variety library, where a
 * person reads it, and the interval onto variety_harvest_targets, where
 * the calendar reads it. Both carry the confidence.
 *
 * Never overwrites anything stronger. A variety whose interval came from a
 * measured WSU pair, or from this orchard's own harvests, keeps it.
 *
 *   npx tsx scripts/seed-harvest-reference.ts [--dry-run]
 */
import { sql } from '@vercel/postgres';
import dotenv from 'dotenv';
import { HARVEST_REFERENCE } from '../lib/data/harvest-reference';
import { deriveReference } from '../lib/harvest-reference-derive';
import { PURPOSE_TARGETS, type HarvestPurpose } from '../lib/harvest-target';

dotenv.config({ path: '.env.local' });
const dryRun = process.argv.includes('--dry-run');

/** Cider fruit hangs longer than fresh off the same tree. */
const FRESH_LEAD_DAYS = 10;
/** Below this the fresh figure stops meaning anything; soft fruit is picked ripe either way. */
const MIN_DAYS = 30;

async function main() {
  let libraryWrites = 0;
  let targetWrites = 0;
  let skippedStronger = 0;
  const byConfidence: Record<string, number> = {};

  for (const ref of HARVEST_REFERENCE) {
    const d = deriveReference(ref);
    byConfidence[d.confidence] = (byConfidence[d.confidence] ?? 0) + 1;

    if (!dryRun) {
      // The library row may not exist: these are varieties it never had.
      await sql`
        INSERT INTO variety_attributes (variety, fruit_type, harvest_window, site_id)
        VALUES (${d.variety}, ${d.species}, ${d.prose}, NULL)
        ON CONFLICT DO NOTHING
      `;
      await sql`
        UPDATE variety_attributes
        SET harvest_window = ${d.prose}
        WHERE lower(btrim(variety)) = ${d.variety.toLowerCase()}
          AND site_id IS NULL
          AND btrim(COALESCE(harvest_window, '')) = ''
      `;
      libraryWrites += 1;
    }

    for (const purpose of ['cider', 'fresh'] as HarvestPurpose[]) {
      const days =
        purpose === 'cider' ? d.daysFromBloom : Math.max(MIN_DAYS, d.daysFromBloom - FRESH_LEAD_DAYS);
      if (dryRun) {
        targetWrites += 1;
        continue;
      }
      const res = await sql`
        INSERT INTO variety_harvest_targets
          (variety, site_id, purpose, days_from_bloom, starch_target, basis, detail, ripens_here, sample_count)
        VALUES (
          ${d.variety}, NULL, ${purpose}, ${days},
          ${d.species === 'apple' ? PURPOSE_TARGETS[purpose].starchIndex : null},
          'reference', ${d.detail}, ${d.ripensHere}, 0
        )
        ON CONFLICT (lower(btrim(variety)), purpose, (COALESCE(site_id, '')))
        DO UPDATE SET
          days_from_bloom = EXCLUDED.days_from_bloom,
          basis           = EXCLUDED.basis,
          detail          = EXCLUDED.detail,
          ripens_here     = EXCLUDED.ripens_here,
          updated_at      = NOW()
        -- Researched dates are better than a season word and worse than a
        -- measurement. Only replace what is weaker.
        WHERE variety_harvest_targets.basis IN ('season_word', 'reference')
        RETURNING id
      `;
      if (res.rowCount && res.rowCount > 0) targetWrites += 1;
      else skippedStronger += 1;
    }
  }

  console.log(dryRun ? '\nDry run — nothing written.\n' : '\nSeeded.\n');
  console.log(`  reference varieties : ${HARVEST_REFERENCE.length}`);
  console.log(`  library windows     : ${libraryWrites}`);
  console.log(`  target rows written : ${targetWrites}`);
  console.log(`  left alone (stronger basis already): ${skippedStronger}`);
  console.log('\n  by confidence:');
  for (const [k, n] of Object.entries(byConfidence).sort()) console.log(`    ${k.padEnd(6)} ${n}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
