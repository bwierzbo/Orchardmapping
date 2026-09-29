import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@clerk/nextjs/server';
import { memberOrchardConfigs } from '@/lib/orchard-access';
import { getTreesForOrchards } from '@/lib/db/trees';
import type { TreeStatus } from '@/lib/types';
import PortfolioTable, { type PortfolioRow } from './PortfolioTable';

/**
 * Every tree across every orchard this person is responsible for.
 *
 * The per-orchard table answers "what is in this block". This one answers
 * the question that spans them: what wants picking next, and where is it.
 *
 * Scope comes from membership, not from a parameter -- there is no orchard
 * id to tamper with, so a person sees their own orchards and nothing else.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'All trees',
  description: 'Every tree across your orchards, in picking order.',
};

export default async function PortfolioTreesPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in?redirect_url=/trees');

  const orchards = await memberOrchardConfigs(userId);
  const trees = await getTreesForOrchards(orchards.map((o) => o.id));

  const rows: PortfolioRow[] = trees.map((t) => ({
    tree_id: t.tree_id,
    orchard_id: t.orchard_id,
    orchard_name: t.orchard_name,
    block_id: t.block_id ?? null,
    row_id: t.row_id ?? null,
    position: t.position == null ? null : String(t.position),
    variety: t.variety ?? null,
    fruit_type: t.fruit_type ?? null,
    status: (t.status ?? 'unknown') as TreeStatus,
    harvest_window: t.harvest_window,
    last_harvest: t.last_harvest ? String(t.last_harvest).slice(0, 10) : null,
  }));

  const caption = [
    `${rows.length} tree${rows.length === 1 ? '' : 's'}`,
    `${orchards.length} orchard${orchards.length === 1 ? '' : 's'}`,
  ].join('  ·  ');

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface/80 backdrop-blur-sm sticky top-0 z-40 pt-safe">
        <div className="max-w-[1600px] mx-auto px-5 py-3">
          <Link href="/" className="inline-flex items-center gap-1 text-xs text-bark hover:text-ink">
            <ArrowLeft aria-hidden size={13} /> Orchards
          </Link>
          <h1 className="font-display text-xl font-semibold text-ink">All trees</h1>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-5 py-6 space-y-4">
        <p className="survey-caption">{caption}</p>

        {rows.length === 0 ? (
          <div className="border border-dashed border-line rounded-lg bg-surface p-10 text-center">
            <p className="text-ink font-medium">
              {orchards.length === 0 ? 'No orchards yet' : 'No trees recorded yet'}
            </p>
            <p className="text-sm text-bark mt-1">
              {orchards.length === 0
                ? 'Once an orchard is shared with you, its trees appear here.'
                : 'Place trees on a map or import a CSV, then come back for the list.'}
            </p>
          </div>
        ) : (
          <PortfolioTable trees={rows} />
        )}
      </div>
    </main>
  );
}
