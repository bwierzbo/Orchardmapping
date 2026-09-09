#!/usr/bin/env node

/**
 * Seed the Variety Library from the research JSONL files in
 * scripts/data/ (variety-research-*.jsonl, rootstock-research.jsonl).
 * Idempotent upserts — rerun whenever a batch lands or is revised.
 * Research pass: Sept 2026, WSU Mount Vernon–primary with cross-checked
 * discrepancy notes.
 *
 * Run: npx tsx scripts/seed-variety-library.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'fs';
import path from 'path';

async function main() {
  const { sql } = await import('@vercel/postgres');
  const dir = path.join(__dirname, 'data');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  let varieties = 0;
  let rootstocks = 0;

  for (const file of files) {
    const lines = fs
      .readFileSync(path.join(dir, file), 'utf8')
      .split('\n')
      .filter((l) => l.trim());
    for (const line of lines) {
      const r = JSON.parse(line);
      if (r.rootstock) {
        await sql`
          INSERT INTO rootstock_attributes
            (rootstock, vigor_pct, precocity, anchorage, disease_notes, description, reference_sources, confidence)
          VALUES (${r.rootstock}, ${r.vigor_pct}, ${r.precocity}, ${r.anchorage},
                  ${joinDisc(r.disease_notes, null)}, ${r.description},
                  ${r.sources}, ${r.confidence})
          ON CONFLICT (rootstock) DO UPDATE SET
            vigor_pct = EXCLUDED.vigor_pct, precocity = EXCLUDED.precocity,
            anchorage = EXCLUDED.anchorage, disease_notes = EXCLUDED.disease_notes,
            description = EXCLUDED.description, reference_sources = EXCLUDED.reference_sources,
            confidence = EXCLUDED.confidence, updated_at = NOW()
        `;
        // discrepancies appended to description-adjacent notes column
        if (r.discrepancies) {
          await sql`
            UPDATE rootstock_attributes
            SET disease_notes = ${r.disease_notes},
                description = ${r.description + '\n\nDiscrepancies: ' + r.discrepancies}
            WHERE rootstock = ${r.rootstock}
          `;
        }
        rootstocks++;
      } else {
        await sql`
          INSERT INTO variety_attributes
            (variety, cider_type, origin, bloom_group, ploidy, harvest_window,
             acidity, tannin, typical_sg, vigor, biennial_tendency,
             disease_notes, description, reference_sources, confidence, notes)
          VALUES (${r.variety}, ${r.cider_type}, ${r.origin}, ${r.bloom_group},
                  ${r.ploidy}, ${r.harvest_window}, ${r.acidity}, ${r.tannin},
                  ${r.typical_sg}, ${r.vigor}, ${r.biennial_tendency},
                  ${r.disease_notes}, ${r.description}, ${r.sources},
                  ${r.confidence}, ${r.discrepancies ? 'Discrepancies: ' + r.discrepancies : null})
          ON CONFLICT (variety) DO UPDATE SET
            cider_type = EXCLUDED.cider_type, origin = EXCLUDED.origin,
            bloom_group = COALESCE(EXCLUDED.bloom_group, variety_attributes.bloom_group),
            ploidy = EXCLUDED.ploidy, harvest_window = EXCLUDED.harvest_window,
            acidity = EXCLUDED.acidity, tannin = EXCLUDED.tannin,
            typical_sg = EXCLUDED.typical_sg, vigor = EXCLUDED.vigor,
            biennial_tendency = EXCLUDED.biennial_tendency,
            disease_notes = EXCLUDED.disease_notes, description = EXCLUDED.description,
            reference_sources = EXCLUDED.reference_sources,
            confidence = EXCLUDED.confidence, notes = EXCLUDED.notes,
            updated_at = NOW()
        `;
        varieties++;
      }
    }
    console.log(`  ${file}: processed`);
  }
  console.log(`✅ Seeded ${varieties} varieties, ${rootstocks} rootstocks.`);
  process.exit(0);
}

function joinDisc(a: string | null, b: string | null): string | null {
  return [a, b].filter(Boolean).join('\n\n') || null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
