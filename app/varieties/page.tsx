import Link from 'next/link';
import { classify } from '@/lib/cider-class';
import { sql } from '@vercel/postgres';
import { ArrowLeft } from 'lucide-react';
import VarietyTable from './VarietyTable';

export const dynamic = 'force-dynamic';

interface Row {
  variety: string;
  cider_type: string | null;
  bloom_group: number | null;
  harvest_window: string | null;
  acidity: string | null;
  tannin: string | null;
  typical_sg: string | null;
  confidence: string | null;
  tree_count: number;
}

interface RootstockRow {
  rootstock: string;
  vigor_pct: string | null;
  precocity: string | null;
  anchorage: string | null;
  tree_count: number;
}

/**
 * Variety Library — the curated reference layer (WSU Mount Vernon–primary,
 * cross-checked Sept 2026). Tree counts link the catalog to the planting.
 */
export default async function VarietiesPage() {
  const { rows: varieties } = await sql<Row>`
    SELECT va.variety, va.cider_type, va.bloom_group, va.harvest_window,
           va.acidity, va.tannin, va.typical_sg, va.confidence,
           COALESCE(t.n, 0)::int AS tree_count
    FROM variety_attributes va
    LEFT JOIN (
      SELECT variety, COUNT(*) AS n FROM trees GROUP BY variety
    ) t ON t.variety = va.variety
    ORDER BY t.n DESC NULLS LAST, va.variety
  `;
  // Varieties whose measured juice disagrees with their canonical class.
  // Few rows today, so this is one query and a map rather than a join.
  const { rows: measured } = await sql<{
    variety: string;
    cider_type: string | null;
    tannin_pct: string | null;
    acid_pct: string | null;
  }>`
    SELECT vo.variety, va.cider_type, vo.tannin_pct, vo.acid_pct
    FROM variety_observations vo
    JOIN variety_attributes va
      ON va.site_id IS NULL AND lower(va.variety) = lower(vo.variety)
  `;
  const divergent = new Set(
    measured
      .filter((m) => {
        const r = classify({
          tanninPct: m.tannin_pct == null ? null : Number(m.tannin_pct),
          acidPct: m.acid_pct == null ? null : Number(m.acid_pct),
        });
        return (
          r.ciderClass && m.cider_type && r.ciderClass !== m.cider_type
        );
      })
      .map((m) => m.variety.toLowerCase())
  );

  const { rows: rootstocks } = await sql<RootstockRow>`
    SELECT ra.rootstock, ra.vigor_pct, ra.precocity, ra.anchorage,
           COALESCE(t.n, 0)::int AS tree_count
    FROM rootstock_attributes ra
    LEFT JOIN (
      SELECT rootstock, COUNT(*) AS n FROM trees GROUP BY rootstock
    ) t ON t.rootstock = ra.rootstock
    ORDER BY t.n DESC NULLS LAST, ra.rootstock
  `;

  return (
    <main className="min-h-dvh bg-paper">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-safe">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/" className="p-2 -m-2 rounded-lg text-bark hover:text-ink">
            <ArrowLeft size={20} aria-hidden />
          </Link>
          <h1 className="font-display text-2xl text-ink">Variety Library</h1>
        </div>
        <p className="survey-caption mb-5">
          {varieties.length} varieties · {rootstocks.length} rootstocks · WSU Mount Vernon–primary, cross-checked
        </p>

        <VarietyTable varieties={varieties} divergent={[...divergent]} />

        <h2 className="font-display text-xl text-ink mt-8 mb-2">Rootstocks</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {rootstocks.map((r) => (
            <Link
              key={r.rootstock}
              href={`/varieties/rootstock:${encodeURIComponent(r.rootstock)}`}
              className="rounded-xl border border-line bg-surface p-3 hover:bg-canopy-50/50"
            >
              <p className="font-semibold text-ink">
                {r.rootstock}
                {r.tree_count > 0 && (
                  <span className="ml-2 font-mono text-xs text-bark">{r.tree_count} trees</span>
                )}
              </p>
              <p className="text-xs text-bark mt-1 line-clamp-2">{r.vigor_pct}</p>
              <p className="text-xs text-bark mt-0.5 capitalize">{r.precocity} bearing</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
