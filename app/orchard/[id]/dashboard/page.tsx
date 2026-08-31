import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Map as MapIcon } from 'lucide-react';
import { getOrchardConfigById, getAllOrchardConfigs } from '@/lib/db/orchards';
import { getTreesByOrchard } from '@/lib/db/trees';
import { serializeTree } from '@/lib/serialize';
import { computeOrchardStats } from '@/lib/dashboard-stats';
import { STATUS_LABEL } from '@/components/StatusBadge';
import StatusBadge from '@/components/StatusBadge';
import OrchardSwitcher from '../viewer/OrchardSwitcher';
import OrchardGrid from './OrchardGrid';
import TreeTable from './TreeTable';
import {
  SegmentedStatusBar,
  StatusLegend,
  StackedBarRow,
  Histogram,
  ProgressLine,
  CareBars,
} from './charts';
import type { CareBuckets } from '@/lib/dashboard-stats';

// Live DB data; never prerender at build time
export const dynamic = 'force-dynamic';

const getOrchard = cache(getOrchardConfigById);

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const orchard = await getOrchard(id).catch(() => null);
  if (!orchard) return { title: 'Dashboard' };
  return {
    title: `${orchard.name} dashboard`,
    description: `Tree status dashboard for ${orchard.name} — health, varieties, and care records.`,
  };
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-line rounded-lg shadow-xs p-5">
      <p className="survey-caption">{eyebrow}</p>
      <h2 className="text-lg font-semibold text-ink mt-1 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface border border-line rounded-lg shadow-xs px-4 py-3">
      <p className="font-mono text-xl text-ink truncate" title={value}>
        {value}
      </p>
      <p className="survey-caption mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-bark mt-0.5">{sub}</p>}
    </div>
  );
}

function careBucketList(b: CareBuckets) {
  return [
    { label: '<6 mo', count: b.under6mo, tone: 'ok' as const },
    { label: '6–12 mo', count: b.sixTo12mo, tone: 'ok' as const },
    { label: '>12 mo', count: b.over12mo, tone: 'warn' as const },
    { label: 'never', count: b.never, tone: 'muted' as const },
  ];
}

export default async function DashboardPage({ params }: PageProps) {
  const { id } = await params;
  const [orchard, allOrchards, dbTrees] = await Promise.all([
    getOrchard(id),
    getAllOrchardConfigs(),
    getTreesByOrchard(id),
  ]);
  if (!orchard) notFound();

  const trees = dbTrees.map(serializeTree);
  const stats = computeOrchardStats(trees);
  const [lng, lat] = orchard.center;
  const caption = [
    `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}`,
    `${Math.abs(lng).toFixed(5)}° ${lng >= 0 ? 'E' : 'W'}`,
    `${stats.total} trees`,
    `${stats.rows.length} rows`,
  ].join('  ·  ');
  const maxVarietyTotal = Math.max(1, ...stats.varieties.map((v) => v.total));

  return (
    <main className="min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-line bg-surface/80 backdrop-blur-sm sticky top-0 z-40 pt-safe">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/orchard/${orchard.id}`}
              className="inline-flex items-center gap-1 text-xs text-bark hover:text-ink"
            >
              <ArrowLeft aria-hidden size={13} /> Map
            </Link>
            <h1 className="font-display text-xl font-semibold text-ink truncate">
              {orchard.name}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <OrchardSwitcher orchards={allOrchards} currentId={orchard.id} target="dashboard" />
            <Link
              href={`/orchard/${orchard.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-canopy-600 text-white dark:text-paper text-sm font-medium rounded-lg hover:bg-canopy-700"
            >
              <MapIcon aria-hidden size={15} />
              <span className="hidden sm:inline">View map</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 py-8 space-y-6">
        <p className="survey-caption">{caption}</p>

        {stats.total === 0 ? (
          <div className="border border-dashed border-line rounded-lg bg-surface p-10 text-center">
            <p className="text-ink font-medium">No trees recorded yet</p>
            <p className="text-sm text-bark mt-1">
              Place trees on the map or import a CSV, then come back for the numbers.
            </p>
            <Link
              href={`/orchard/${orchard.id}`}
              className="inline-block mt-4 px-4 py-2 bg-canopy-600 text-white dark:text-paper text-sm font-medium rounded-md hover:bg-canopy-700"
            >
              Open the map
            </Link>
          </div>
        ) : (
          <>
            {/* Summary tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <Tile label="Trees" value={String(stats.total)} />
              <Tile label="Healthy" value={`${stats.statusPct.healthy}%`} />
              <Tile
                label="Varieties"
                value={String(stats.varieties.filter((v) => v.variety !== null).length)}
              />
              <Tile label="Rows" value={String(stats.rows.length)} />
              <Tile
                label="Avg age"
                value={
                  stats.ageUnknown === stats.total
                    ? '—'
                    : `${(
                        trees.reduce((a, t) => a + (t.age ?? 0), 0) /
                        Math.max(1, stats.total - stats.ageUnknown)
                      ).toFixed(1)} yr`
                }
              />
              <Tile
                label="Yield est."
                value={stats.yieldStats.treesWithData > 0 ? `${stats.yieldStats.totalKg} kg` : '—'}
              />
            </div>

            <Section eyebrow="Field report · Status" title="Tree health">
              <SegmentedStatusBar counts={stats.statusCounts} total={stats.total} />
              <div className="mt-3">
                <StatusLegend counts={stats.statusCounts} pct={stats.statusPct} />
              </div>
            </Section>

            <Section eyebrow="Rows × positions" title="The orchard, tree by tree">
              <OrchardGrid rows={stats.rows} orchardId={orchard.id} unplacedCount={stats.unplacedCount} />
            </Section>

            <Section eyebrow="Field report · Varieties" title="What's planted">
              <div className="space-y-2">
                {stats.varieties.map((v) => (
                  <StackedBarRow
                    key={v.variety ?? '∅'}
                    label={v.variety ?? 'Unrecorded'}
                    total={v.total}
                    byStatus={v.byStatus}
                    maxTotal={maxVarietyTotal}
                    muted={v.variety === null}
                  />
                ))}
              </div>
            </Section>

            <div className="grid lg:grid-cols-2 gap-6">
              <Section eyebrow="Field report · Age" title="Age distribution">
                <Histogram
                  buckets={stats.ageHistogram.map((b) => ({ label: b.label, count: b.count }))}
                  ariaLabel={`Age distribution: ${stats.ageHistogram
                    .map((b) => `${b.label} years ${b.count}`)
                    .join(', ')}`}
                />
                {stats.ageUnknown > 0 && (
                  <p className="survey-caption mt-3">{stats.ageUnknown} without recorded age</p>
                )}
              </Section>

              <Section eyebrow="Field report · Planting" title="Planted by year">
                {stats.plantedByYear.length > 0 ? (
                  <>
                    <Histogram
                      buckets={stats.plantedByYear.map((y) => ({
                        label: String(y.year),
                        count: y.count,
                      }))}
                      ariaLabel={`Planted by year: ${stats.plantedByYear
                        .map((y) => `${y.year} ${y.count}`)
                        .join(', ')}`}
                    />
                    {stats.plantedUnknown > 0 && (
                      <p className="survey-caption mt-3">
                        {stats.plantedUnknown} without planted date
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-bark">No planted dates recorded.</p>
                )}
              </Section>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Section eyebrow="Care log" title="Care recency">
                <div className="space-y-5">
                  <CareBars title="Pruned" buckets={careBucketList(stats.careRecency.pruned)} />
                  <CareBars title="Harvested" buckets={careBucketList(stats.careRecency.harvest)} />
                </div>
              </Section>

              <Section eyebrow="Care log · Yield" title="Yield estimates">
                {stats.yieldStats.treesWithData > 0 ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="font-mono text-xl text-ink">{stats.yieldStats.totalKg}</p>
                        <p className="survey-caption">Total kg</p>
                      </div>
                      <div>
                        <p className="font-mono text-xl text-ink">{stats.yieldStats.avgKg}</p>
                        <p className="survey-caption">Avg kg / tree</p>
                      </div>
                      <div>
                        <p className="font-mono text-xl text-ink truncate">
                          {stats.yieldStats.topVariety?.variety ?? 'Unrecorded'}
                        </p>
                        <p className="survey-caption">Top variety</p>
                      </div>
                    </div>
                    <p className="survey-caption mt-4">
                      Based on {stats.yieldStats.treesWithData} of {stats.total} trees
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-bark">No yield estimates recorded.</p>
                )}
              </Section>
            </div>

            <Section eyebrow="Survey · Records" title="Data completeness">
              <div className="space-y-2.5">
                {stats.completeness.map((c) => (
                  <ProgressLine key={c.field} label={c.label} present={c.present} total={stats.total} />
                ))}
              </div>
            </Section>

            {stats.notes.length > 0 && (
              <Section eyebrow="Field report · Notes" title="Tree notes">
                <ul className="space-y-3">
                  {stats.notes.map((n) => (
                    <li key={n.tree_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <Link
                        href={`/orchard/${orchard.id}?tree=${encodeURIComponent(n.tree_id)}`}
                        className="font-mono text-xs text-canopy-600 hover:text-canopy-700"
                      >
                        {n.tree_id}
                      </Link>
                      <StatusBadge status={n.status} />
                      <span className="text-sm text-ink w-full sm:w-auto sm:flex-1">{n.notes}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section eyebrow="Survey · Inventory" title="All trees">
              <TreeTable trees={trees} orchardId={orchard.id} />
            </Section>
          </>
        )}

        <p className="survey-caption text-center pt-2">
          {orchard.name} · {STATUS_LABEL.healthy} {stats.statusCounts.healthy} ·{' '}
          {STATUS_LABEL.stressed} {stats.statusCounts.stressed} · {STATUS_LABEL.dead}{' '}
          {stats.statusCounts.dead} · {STATUS_LABEL.unknown} {stats.statusCounts.unknown}
        </p>
      </div>
    </main>
  );
}
