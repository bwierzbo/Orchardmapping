import { config } from 'dotenv';
config({ path: '.env.local' });

/**
 * What do we actually know, and how do we know it?
 *
 *   npx tsx scripts/audit-provenance.ts            everything, weakest first
 *   npx tsx scripts/audit-provenance.ts assumed    only the unsourced
 *   npx tsx scripts/audit-provenance.ts quoted     with the sentences, to re-check
 *
 * This exists because five agronomic claims were audited by hand and
 * four were wrong. The one that was right had been fetched and quoted
 * directly; everything reconstructed from a search summary was wrong,
 * and the errors ran consistently toward quieter models and shorter
 * intervals. Copper's re-entry was half its real value.
 *
 * Read the `assumed` block first. Those are the numbers with nobody
 * behind them, and they are where the next mistake is.
 */

import { sql } from '@vercel/postgres';
import { CODE_PROVENANCE, type Confidence, type Provenance } from '../lib/provenance';

const WANTED = process.argv[2] as Confidence | undefined;

async function dbProvenance(): Promise<Provenance[]> {
  const { rows } = await sql`
    SELECT subject, value_text, confidence, source, quote, url,
           to_char(verified_on, 'YYYY-MM-DD') AS verified_on, note
    FROM value_provenance`;
  return rows.map((r) => ({
    subject: String(r.subject),
    value: String(r.value_text),
    confidence: String(r.confidence) as Confidence,
    source: String(r.source),
    quote: (r.quote as string | null) ?? undefined,
    url: (r.url as string | null) ?? undefined,
    verifiedOn: (r.verified_on as string | null) ?? undefined,
    note: (r.note as string | null) ?? undefined,
  }));
}

function wrap(text: string, indent: string, width = 76): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) {
      lines.push(line.trim());
      line = w;
    } else line += ' ' + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.map((l) => indent + l).join('\n');
}

async function main() {
  const all = [...(await dbProvenance()), ...CODE_PROVENANCE];
  const rank: Record<Confidence, number> = { assumed: 0, derived: 1, quoted: 2 };
  const shown = (WANTED ? all.filter((p) => p.confidence === WANTED) : all).sort(
    (a, b) => rank[a.confidence] - rank[b.confidence] || a.subject.localeCompare(b.subject)
  );

  const counts = { assumed: 0, derived: 0, quoted: 0 };
  for (const p of all) counts[p.confidence] += 1;

  console.log(
    `${all.length} recorded values — ` +
    `${counts.quoted} quoted, ${counts.derived} derived, ${counts.assumed} ASSUMED\n`
  );

  let heading: Confidence | null = null;
  for (const p of shown) {
    if (p.confidence !== heading) {
      heading = p.confidence;
      const banner =
        heading === 'assumed'
          ? 'ASSUMED — our own defaults, nobody behind them. Start here.'
          : heading === 'derived'
            ? 'DERIVED — computed from something quoted.'
            : 'QUOTED — check each against its stored sentence.';
      console.log(`\n${'═'.repeat(78)}\n${banner}\n${'═'.repeat(78)}`);
    }
    console.log(`\n  ${p.subject}`);
    console.log(`    value   ${p.value}`);
    console.log(`    source  ${p.source}${p.verifiedOn ? `  (checked ${p.verifiedOn})` : ''}`);
    if (p.quote && (WANTED === 'quoted' || !WANTED)) {
      console.log(wrap(`“${p.quote}”`, '            '));
    }
    if (p.url) console.log(`            ${p.url}`);
    if (p.note) console.log(wrap(p.note, '    → '));
  }

  if (!WANTED && counts.assumed > 0) {
    console.log(
      `\n${'─'.repeat(78)}\n` +
      `${counts.assumed} values have no source. Each is a decision someone made\n` +
      `because a number was needed — which is legitimate, and is exactly\n` +
      `where the last four errors were found.\n`
    );
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
