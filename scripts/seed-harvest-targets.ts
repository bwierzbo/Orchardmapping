#!/usr/bin/env node
/**
 * Seed variety_harvest_targets from what the variety library already says.
 *
 * The library's harvest_window is prose, and eight entries carry a paired
 * bloom and harvest date from WSU Mount Vernon -- the right reference for
 * maritime western Washington, and a cider station, so those intervals are
 * cider intervals. Everything derivable is derived, each row carrying the
 * basis it rests on so a seeded guess never passes for an observation.
 *
 * Idempotent: re-running updates the curated rows in place and leaves any
 * site-local row alone, because a site's own value outranks a seeded one.
 * Rows whose basis is 'observed' are never touched.
 *
 *   npx tsx scripts/seed-harvest-targets.ts [--dry-run]
 */
import { sql } from '@vercel/postgres';
import dotenv from 'dotenv';
import { deriveDaysFromBloom, PURPOSE_TARGETS, type HarvestPurpose } from '../lib/harvest-target';

dotenv.config({ path: '.env.local' });

const dryRun = process.argv.includes('--dry-run');

/**
 * Cider fruit hangs longer than fresh fruit off the same tree: the starch
 * keeps converting, the sugar climbs, and the window stays open through the
 * drop. The library's WSU intervals were taken at a cider station, so they
 * are the cider figure and the fresh figure sits earlier.
 */
const FRESH_LEAD_DAYS = 10;

async function main() {
  const { rows } = await sql`
    SELECT variety, harvest_window
    FROM variety_attributes
    WHERE site_id IS NULL AND btrim(COALESCE(harvest_window, '')) <> ''
    ORDER BY variety
  `;

  const counts: Record<string, number> = {};
  let written = 0;
  let skipped = 0;

  for (const row of rows) {
    const variety = String(row.variety);
    const derived = deriveDaysFromBloom(String(row.harvest_window));
    if (!derived) {
      skipped += 1;
      continue;
    }
    counts[derived.basis] = (counts[derived.basis] ?? 0) + 1;

    for (const purpose of ['cider', 'fresh'] as HarvestPurpose[]) {
      const days =
        purpose === 'cider' ? derived.daysFromBloom : derived.daysFromBloom - FRESH_LEAD_DAYS;
      // The CHECK holds the interval to a plausible apple season; a fresh
      // figure pulled below it says the derivation was too weak to split.
      if (days < 60 || days > 260) continue;

      const detail =
        purpose === 'fresh'
          ? `${derived.detail} Fresh target set ${FRESH_LEAD_DAYS} days earlier than the cider one.`
          : derived.detail;

      if (dryRun) {
        written += 1;
        continue;
      }
      await sql`
        INSERT INTO variety_harvest_targets
          (variety, site_id, purpose, days_from_bloom, starch_target, basis, detail, sample_count)
        VALUES (
          ${variety}, NULL, ${purpose}, ${days},
          ${PURPOSE_TARGETS[purpose].starchIndex}, ${derived.basis}, ${detail}, 0
        )
        ON CONFLICT (lower(btrim(variety)), purpose, (COALESCE(site_id, '')))
        DO UPDATE SET
          days_from_bloom = EXCLUDED.days_from_bloom,
          starch_target   = EXCLUDED.starch_target,
          basis           = EXCLUDED.basis,
          detail          = EXCLUDED.detail,
          updated_at      = NOW()
        -- An interval learned here outranks anything seeded, so a re-run
        -- must not overwrite it.
        WHERE variety_harvest_targets.basis <> 'observed'
      `;
      written += 1;
    }
  }

  console.log(dryRun ? '\nDry run — nothing written.\n' : '\nSeeded.\n');
  console.log(`  varieties with a window : ${rows.length}`);
  console.log(`  derived                 : ${rows.length - skipped}`);
  console.log(`  unreadable              : ${skipped}`);
  console.log(`  target rows             : ${written}`);
  console.log('\n  by basis:');
  for (const [basis, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${basis.padEnd(13)} ${n}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
