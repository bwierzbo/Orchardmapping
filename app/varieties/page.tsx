import Link from 'next/link';
import { sql } from '@vercel/postgres';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  BSH: 'Bittersharp',
  SH: 'Sharp',
  BSW: 'Bittersweet',
  SW: 'Sweet',
  dessert: 'Dessert',
  crab: 'Crab',
};

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

        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-3 py-2 font-medium text-bark">Variety</th>
                <th className="px-3 py-2 font-medium text-bark">Class</th>
                <th className="px-3 py-2 font-medium text-bark">Bloom</th>
                <th className="px-3 py-2 font-medium text-bark">Harvest</th>
                <th className="px-3 py-2 font-medium text-bark">Acid</th>
                <th className="px-3 py-2 font-medium text-bark">Tannin</th>
                <th className="px-3 py-2 font-medium text-bark">SG</th>
                <th className="px-3 py-2 font-medium text-bark text-right">Trees</th>
              </tr>
            </thead>
            <tbody>
              {varieties.map((v) => (
                <tr key={v.variety} className="border-b border-line/60 last:border-0 hover:bg-canopy-50/50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/varieties/${encodeURIComponent(v.variety)}`}
                      className="font-medium text-ink hover:text-canopy-700 hover:underline"
                    >
                      {v.variety}
                    </Link>
                    {v.confidence === 'low' && (
                      <span className="ml-1.5 text-[10px] text-flag-600 font-mono uppercase">low conf</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-bark">{v.cider_type ? (TYPE_LABEL[v.cider_type] ?? v.cider_type) : '—'}</td>
                  <td className="px-3 py-2 text-bark">{v.bloom_group ?? '—'}</td>
                  <td className="px-3 py-2 text-bark max-w-[200px] truncate" title={v.harvest_window ?? undefined}>
                    {v.harvest_window ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-bark capitalize">{v.acidity ?? '—'}</td>
                  <td className="px-3 py-2 text-bark capitalize">{v.tannin ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-bark max-w-[90px] truncate" title={v.typical_sg ?? undefined}>
                    {v.typical_sg ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-ink">{v.tree_count || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
