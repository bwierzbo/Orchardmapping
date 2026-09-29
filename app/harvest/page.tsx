import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@clerk/nextjs/server';
import { memberOrchardConfigs } from '@/lib/orchard-access';
import { harvestPlan } from '@/lib/db/harvest-plan';
import type { HarvestPurpose } from '@/lib/harvest-target';
import HarvestCalendar from './HarvestCalendar';

/**
 * The picking calendar, across every orchard or inside one.
 *
 * Scope comes from membership, and the orchard in the query string is
 * intersected with it rather than trusted -- a stranger's id in the URL
 * narrows to nothing rather than reaching their trees.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Harvest calendar',
  description: 'When each variety wants picking, across your orchards.',
};

interface PageProps {
  searchParams: Promise<{ orchard?: string }>;
}

export default async function HarvestPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in?redirect_url=/harvest');

  const { orchard: requested } = await searchParams;
  const orchards = await memberOrchardConfigs(userId);

  const selected = requested ? orchards.find((o) => o.id === requested) ?? null : null;
  const scoped = selected ? [selected] : orchards;

  // One orchard's own purpose is its default; across a mixed portfolio the
  // cidery's answer is the useful one to land on.
  const defaultPurpose: HarvestPurpose = selected
    ? selected.harvestPurpose
    : scoped.some((o) => o.harvestPurpose === 'cider')
      ? 'cider'
      : 'fresh';

  // Read once here rather than in the markup: this is a dynamic server
  // render, so it is the request's own clock, and the client never has to
  // agree with it.
  const now = new Date();
  const year = now.getUTCFullYear();
  const todayMs = now.getTime();
  const rows = await harvestPlan(
    scoped.map((o) => o.id),
    defaultPurpose,
    year
  );

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-surface/80 backdrop-blur-sm sticky top-0 z-40 pt-safe">
        <div className="max-w-[1400px] mx-auto px-5 py-3">
          <Link href="/" className="inline-flex items-center gap-1 text-xs text-bark hover:text-ink">
            <ArrowLeft aria-hidden size={13} /> Orchards
          </Link>
          <h1 className="font-display text-xl font-semibold text-ink">
            Harvest calendar <span className="text-bark font-normal">{year}</span>
          </h1>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-5 py-6">
        {orchards.length === 0 ? (
          <div className="border border-dashed border-line rounded-lg bg-surface p-10 text-center">
            <p className="text-ink font-medium">No orchards yet</p>
            <p className="text-sm text-bark mt-1">
              Once an orchard is shared with you, its varieties appear here.
            </p>
          </div>
        ) : (
          <HarvestCalendar
            rows={rows}
            year={year}
            defaultPurpose={defaultPurpose}
            orchards={orchards.map((o) => ({ id: o.id, name: o.name }))}
            selectedOrchardId={selected?.id ?? null}
            todayMs={todayMs}
          />
        )}
      </div>
    </main>
  );
}
