/**
 * Merge an exported variety list into the curated (global) library.
 *
 * The list is a checked-in export rather than a live query against the
 * other app's database: two production apps sharing one database couples
 * their migrations together, and this data changes a few times a year.
 * This is the shared reference package in embryo — when it becomes one,
 * this script reads it from the package instead of scripts/data/.
 *
 * Existing curated rows win. This only fills fields that are empty, so a
 * researched entry is never overwritten by a thinner operational one.
 *
 * Run: npx tsx scripts/import-variety-list.ts [--dry-run]
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync } from 'fs';
import path from 'path';
import { sql } from '@vercel/postgres';

/** CiderPilot's cider_category vocabulary onto the orchard's cider_type. */
const CATEGORY: Record<string, string> = {
  bittersweet: 'BSW',
  bittersharp: 'BSH',
  sharp: 'SH',
  sweet: 'SW',
};

interface Incoming {
  name: string;
  fruit_type: string | null;
  cider_category: string | null;
  tannin: string | null;
  acid: string | null;
  harvest_window: string | null;
  variety_notes: string | null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const file = path.join(__dirname, 'data', 'ciderpilot-varieties.json');
  const { varieties, source } = JSON.parse(readFileSync(file, 'utf-8')) as {
    source: string;
    varieties: Incoming[];
  };

  const { rows: existing } = await sql`
    SELECT variety FROM variety_attributes WHERE site_id IS NULL
  `;
  const have = new Set(existing.map((r) => String(r.variety).toLowerCase()));

  let created = 0;
  let filled = 0;

  for (const v of varieties) {
    const name = v.name.trim();
    if (!name) continue;
    const ciderType = v.cider_category ? (CATEGORY[v.cider_category] ?? null) : null;

    if (have.has(name.toLowerCase())) {
      // Fill gaps only — never overwrite researched values
      const r = await sql`
        UPDATE variety_attributes SET
          cider_type     = COALESCE(cider_type, ${ciderType}),
          tannin         = COALESCE(tannin, ${v.tannin}),
          acidity        = COALESCE(acidity, ${v.acid}),
          harvest_window = COALESCE(harvest_window, ${v.harvest_window}),
          notes          = COALESCE(notes, ${v.variety_notes}),
          fruit_type     = COALESCE(NULLIF(fruit_type, ''), ${v.fruit_type ?? 'apple'}),
          updated_at     = NOW()
        WHERE site_id IS NULL AND lower(variety) = ${name.toLowerCase()}
          AND (cider_type IS NULL OR tannin IS NULL OR acidity IS NULL
               OR harvest_window IS NULL OR notes IS NULL)
      `;
      if (r.rowCount) filled++;
      continue;
    }

    if (!dryRun) {
      await sql`
        INSERT INTO variety_attributes
          (variety, fruit_type, cider_type, tannin, acidity, harvest_window, notes,
           reference_sources, confidence, site_id)
        VALUES (${name}, ${v.fruit_type ?? 'apple'}, ${ciderType}, ${v.tannin}, ${v.acid},
                ${v.harvest_window}, ${v.variety_notes}, ${source}, 'low', NULL)
        ON CONFLICT DO NOTHING
      `;
    }
    created++;
  }

  console.log(
    `${dryRun ? '[dry run] ' : ''}${created} added to the curated layer, ${filled} existing rows had gaps filled.`
  );
  const { rows } = await sql`
    SELECT count(*) FILTER (WHERE site_id IS NULL)::int AS curated,
           count(*) FILTER (WHERE site_id IS NOT NULL)::int AS private
    FROM variety_attributes
  `;
  console.log('library now:', rows[0]);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
