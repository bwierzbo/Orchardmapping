/**
 * APPLIED 2026-11-14 — do not rerun; kept as the record.
 * Published flowering groups for the apple varieties planted here
 * (scripts/data/flowering-groups.json, researched 2026-11-14 with a source
 * per variety), so the bloom estimate can place varieties that have no
 * reference bloom date (lib/bloom-estimate.ts). Written to every library
 * entry of that name, curated and site-owned; a variety with no published
 * group is left empty rather than guessed.
 *
 *   npx tsx --env-file=.env.local scripts/data-flowering-groups-2026-11-14.ts            # plan
 *   npx tsx --env-file=.env.local scripts/data-flowering-groups-2026-11-14.ts --apply
 */
import { readFileSync } from 'fs';
import path from 'path';
import { sql } from '@vercel/postgres';

const APPLY = process.argv.includes('--apply');

async function main() {
  const file = path.join(process.cwd(), 'scripts', 'data', 'flowering-groups.json');
  const { varieties } = JSON.parse(readFileSync(file, 'utf-8')) as {
    varieties: { variety: string; group: number; source: string; note: string }[];
  };
  let matched = 0;
  const missing: string[] = [];
  for (const v of varieties) {
    const { rows } = await sql`
      SELECT count(*)::int AS n FROM variety_attributes WHERE lower(btrim(variety)) = lower(${v.variety})`;
    if (rows[0].n === 0) {
      missing.push(v.variety);
      continue;
    }
    matched += rows[0].n;
    if (APPLY) {
      await sql`
        UPDATE variety_attributes
           SET flowering_group = ${v.group},
               flowering_group_source = ${`${v.source} (${v.note})`},
               updated_at = NOW()
         WHERE lower(btrim(variety)) = lower(${v.variety})`;
    }
  }
  console.log(`${varieties.length} varieties, ${matched} library entries${APPLY ? ' updated' : ' to update'}`);
  if (missing.length) console.log('not in the library:', missing.join(', '));
  if (!APPLY) console.log('plan only; pass --apply');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
