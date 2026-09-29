import { cache } from 'react';
import { requireOrchardPage } from '@/lib/orchard-page';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Map as MapIcon } from 'lucide-react';
import { getOrchardConfigById } from '@/lib/db/orchards';
import { memberOrchardConfigs } from '@/lib/orchard-access';
import { auth } from '@clerk/nextjs/server';
import { getTreesByOrchard } from '@/lib/db/trees';
import { serializeTree } from '@/lib/serialize';
import OrchardSwitcher from '../viewer/OrchardSwitcher';
import TreeTable from '../dashboard/TreeTable';

/**
 * Every tree in the orchard, as a spreadsheet.
 *
 * The same table the stats page carries, on a page of its own and at full
 * width -- reading an inventory means seeing the columns side by side, and
 * a page sized for charts squeezes them. Nothing is downloaded: the rows
 * sort and the cells edit in place.
 */

export const dynamic = 'force-dynamic';

const getOrchard = cache(getOrchardConfigById);

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  await requireOrchardPage(id);
  const orchard = await getOrchard(id).catch(() => null);
  if (!orchard) return { title: 'Trees' };
  return {
    title: `${orchard.name} trees`,
    description: `Every tree in ${orchard.name} — block, row, position, variety and care records.`,
  };
}

export default async function TreesPage({ params }: PageProps) {
  const { id } = await params;
  await requireOrchardPage(id);
  const orchard = await getOrchard(id).catch(() => null);
  if (!orchard) notFound();

  const { userId } = await auth();
  const [rawTrees, allOrchards] = await Promise.all([
    getTreesByOrchard(orchard.id),
    userId ? memberOrchardConfigs(userId) : Promise.resolve([]),
  ]);
  const trees = rawTrees.map(serializeTree);

  const blocks = new Set<string>();
  const rows = new Set<string>();
  for (const t of trees) {
    if (t.block_id?.trim()) blocks.add(t.block_id.trim());
    if (t.row_id?.trim()) rows.add(t.row_id.trim());
  }
  const caption = [
    `${trees.length} trees`,
    blocks.size > 0 ? `${blocks.size} block${blocks.size === 1 ? '' : 's'}` : null,
    `${rows.size} row${rows.size === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface/80 backdrop-blur-sm sticky top-0 z-40 pt-safe">
        <div className="max-w-[1600px] mx-auto px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/orchard/${orchard.id}/dashboard`}
              className="inline-flex items-center gap-1 text-xs text-bark hover:text-ink"
            >
              <ArrowLeft aria-hidden size={13} /> Today
            </Link>
            <h1 className="font-display text-xl font-semibold text-ink truncate">
              {orchard.name} — every tree
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <OrchardSwitcher orchards={allOrchards} currentId={orchard.id} target="trees" />
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

      <div className="max-w-[1600px] mx-auto px-5 py-6 space-y-4">
        <p className="survey-caption">{caption}</p>

        {trees.length === 0 ? (
          <div className="border border-dashed border-line rounded-lg bg-surface p-10 text-center">
            <p className="text-ink font-medium">No trees recorded yet</p>
            <p className="text-sm text-bark mt-1">
              Place trees on the map or import a CSV, then come back for the list.
            </p>
          </div>
        ) : (
          <TreeTable trees={trees} orchardId={orchard.id} />
        )}
      </div>
    </main>
  );
}
