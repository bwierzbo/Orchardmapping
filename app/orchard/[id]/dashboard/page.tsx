import { cache, Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import {
  ArrowLeft, BarChart3, Bug, CalendarRange, FlaskConical,
  Map as MapIcon, SprayCan, Target, Users } from 'lucide-react';
import { getOrchardConfigById, getAllOrchardConfigs } from '@/lib/db/orchards';
import { getTreesByOrchard } from '@/lib/db/trees';
import { serializeTree } from '@/lib/serialize';
import { computeOrchardStats } from '@/lib/dashboard-stats';
import OrchardSwitcher from '../viewer/OrchardSwitcher';
import SeasonCard from './SeasonCard';
import StageCard from './StageCard';
import DueNowCard from './DueNowCard';
import { viewerRole, roleAtLeast } from '@/lib/orchard-access';

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

export default async function DashboardPage({ params }: PageProps) {
  const { id } = await params;
  const [orchard, allOrchards, dbTrees, { userId }] = await Promise.all([
    getOrchard(id),
    getAllOrchardConfigs(),
    getTreesByOrchard(id),
    auth(),
  ]);
  if (!orchard) notFound();

  // The layout already proved membership; this decides operator vs viewer.
  const role = await viewerRole(id);
  const canEdit = !!role && roleAtLeast(role, 'operator');

  const trees = dbTrees.map(serializeTree);
  const stats = computeOrchardStats(trees);
  const [lng, lat] = orchard.center;
  const caption = [
    `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}`,
    `${Math.abs(lng).toFixed(5)}° ${lng >= 0 ? 'E' : 'W'}`,
    `${stats.total} trees`,
    `${stats.rows.length} rows`,
  ].join('  ·  ');

  return (
    <main className="min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-line bg-surface/80 backdrop-blur-sm sticky top-0 z-40 pt-safe">
        <div className="max-w-6xl mx-auto px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/orchard/${orchard.id}`}
              className="inline-flex items-center gap-1 text-xs text-bark hover:text-ink"
            >
              <ArrowLeft aria-hidden size={13} /> Map
            </Link>
            <h1 className="font-display text-xl font-semibold text-ink truncate">
              {orchard.name} — today
            </h1>
          </div>

          {/*
            IPM navigation. Labels show at EVERY width: these were
            icon-only below the md breakpoint, which made four unlabelled
            glyphs the only route to the whole programme on exactly the
            device it is read on — a phone, in the orchard. On a narrow
            screen the row wraps to its own line rather than shedding its
            words.
          */}
          <nav
            aria-label="Orchard management"
            className="order-last w-full sm:order-none sm:w-auto flex items-center gap-1 overflow-x-auto"
          >
            <Link
              href={`/orchard/${orchard.id}/stats`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-bark hover:text-ink rounded-lg hover:bg-canopy-50 dark:hover:bg-canopy-600/10 whitespace-nowrap"
            >
              <BarChart3 aria-hidden size={15} />
              Block
            </Link>
            <Link
              href={`/orchard/${orchard.id}/program`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-bark hover:text-ink rounded-lg hover:bg-canopy-50 dark:hover:bg-canopy-600/10 whitespace-nowrap"
            >
              <CalendarRange aria-hidden size={15} />
              Program
            </Link>
            <Link
              href={`/orchard/${orchard.id}/pests`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-bark hover:text-ink rounded-lg hover:bg-canopy-50 dark:hover:bg-canopy-600/10 whitespace-nowrap"
            >
              <Bug aria-hidden size={15} />
              Pests
            </Link>
            <Link
              href={`/orchard/${orchard.id}/traps`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-bark hover:text-ink rounded-lg hover:bg-canopy-50 dark:hover:bg-canopy-600/10 whitespace-nowrap"
            >
              <Target aria-hidden size={15} />
              Traps
            </Link>
            <Link
              href={`/orchard/${orchard.id}/members`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-bark hover:text-ink rounded-lg hover:bg-canopy-50 dark:hover:bg-canopy-600/10 whitespace-nowrap"
            >
              <Users aria-hidden size={15} />
              People
            </Link>
            <Link
              href={`/orchard/${orchard.id}/nutrition`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-bark hover:text-ink rounded-lg hover:bg-canopy-50 dark:hover:bg-canopy-600/10 whitespace-nowrap"
            >
              <FlaskConical aria-hidden size={15} />
              Nutrition
            </Link>
            <Link
              href={`/orchard/${orchard.id}/spray`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-bark hover:text-ink rounded-lg hover:bg-canopy-50 dark:hover:bg-canopy-600/10 whitespace-nowrap"
            >
              <SprayCan aria-hidden size={15} />
              Spray
            </Link>
          </nav>

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

        <Suspense
          fallback={
            <section className="bg-surface border border-line rounded-lg shadow-xs p-5">
              <p className="survey-caption">Program · Due now</p>
              <p className="text-sm text-bark mt-2">Working out what the program asks for…</p>
            </section>
          }
        >
          <DueNowCard orchardId={orchard.id} canEdit={canEdit} />
        </Suspense>

        <Suspense
          fallback={
            <section className="bg-surface border border-line rounded-lg shadow-xs p-5">
              <p className="survey-caption">Season · Growth stage</p>
              <p className="text-sm text-bark mt-2">Loading growth stage…</p>
            </section>
          }
        >
          <StageCard orchardId={orchard.id} canEdit={canEdit} />
        </Suspense>

        <Suspense
          fallback={
            <section className="bg-surface border border-line rounded-lg shadow-xs p-5">
              <p className="survey-caption">Season · Weather</p>
              <p className="text-sm text-bark mt-2">Loading chill &amp; heat accumulation…</p>
            </section>
          }
        >
          <SeasonCard orchardId={orchard.id} lat={lat} lng={lng} />
        </Suspense>

        {/*
          The census moved to /stats. This page had thirteen cards
          serving two different people: someone asking what to do this
          morning, and someone auditing the block. In the orchard on a
          phone the second was nine scrolls of noise between you and the
          answer.
        */}
        <Link
          href={`/orchard/${orchard.id}/stats`}
          className="block bg-surface border border-line rounded-lg shadow-xs p-5 hover:border-canopy-600 transition-colors"
        >
          <p className="survey-caption">The block</p>
          <p className="text-ink font-medium mt-1">
            {stats.total > 0
              ? `${stats.total} trees · ${stats.rows.length} rows · ${stats.statusPct.healthy}% healthy`
              : 'No trees recorded yet'}
          </p>
          <p className="text-sm text-bark mt-0.5">
            {stats.total > 0
              ? 'Varieties, ages, row layout, care history and the full tree table →'
              : 'Place trees on the map or import a CSV →'}
          </p>
        </Link>

      </div>
    </main>
  );
}
