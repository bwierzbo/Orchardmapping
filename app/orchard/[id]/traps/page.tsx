import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { ArrowLeft, Target } from 'lucide-react';
import { getOrchardConfigById } from '@/lib/db/orchards';
import { listTraps, weeklyCatches } from '@/lib/db/traps';
import { listProgramSteps } from '@/lib/db/program';
import { TRAP_LABEL, TRAP_NOTE, TRAP_TARGET, TRAP_TYPES, type TrapType } from '@/lib/traps';
import { seasonOf } from '@/lib/phenology';
import { nowLocalIso } from '@/lib/openmeteo';
import { Histogram } from '../dashboard/charts';
import TrapsClient from './TrapsClient';
import { viewerRole, roleAtLeast } from '@/lib/orchard-access';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const orchard = await getOrchardConfigById(id).catch(() => null);
  return { title: orchard ? `${orchard.name} — traps` : 'Traps' };
}

/** "2026-07-06" → "Jul 6", the axis label a weekly series wants. */
function weekLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default async function TrapsPage({ params }: PageProps) {
  const { id } = await params;
  const [orchard, { userId }] = await Promise.all([
    getOrchardConfigById(id).catch(() => null),
    auth(),
  ]);
  if (!orchard) notFound();

  // The layout already proved membership; this decides operator vs viewer.
  const role = await viewerRole(id);
  const canEdit = !!role && roleAtLeast(role, 'operator');

  const today = nowLocalIso(orchard.timezone).slice(0, 10);
  const season = seasonOf(today);
  const [traps, steps] = await Promise.all([
    listTraps(orchard.id, season).catch(() => []),
    listProgramSteps(orchard.id).catch(() => []),
  ]);

  // The action threshold belongs to the program step, not the trap — one
  // place to change "start kaolin on the first catch".
  const thresholdFor = (trapType: TrapType) => {
    for (const s of steps) {
      if (s.trigger.type === 'threshold' && s.trigger.trap === trapType) {
        return { count: s.trigger.count, title: s.title };
      }
    }
    return null;
  };

  const typesInUse = TRAP_TYPES.filter((t) => traps.some((x) => x.trapType === t));
  const series = await Promise.all(
    typesInUse.map(async (t) => ({
      trapType: t,
      weeks: await weeklyCatches(orchard.id, t, season).catch(() => []),
    }))
  );

  return (
    <main className="min-h-dvh bg-paper">
      <div className="max-w-4xl mx-auto px-5 py-8 pb-safe">
        <Link
          href={`/orchard/${orchard.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-bark hover:text-ink mb-5"
        >
          <ArrowLeft aria-hidden size={16} /> {orchard.name}
        </Link>

        <div className="flex items-center gap-2 mb-1">
          <Target className="text-canopy-600" aria-hidden size={22} />
          <h1 className="font-display text-2xl font-semibold text-ink">Traps</h1>
        </div>
        <p className="text-bark text-sm mb-6 max-w-2xl">
          Summer is monitor-only: nothing goes on the calendar, and a spray is justified
          by a catch or not at all. Counting the traps is what turns a watch in the
          program into a job.
        </p>

        {series.map(({ trapType, weeks }) => {
          const t = thresholdFor(trapType);
          if (weeks.length === 0) return null;
          return (
            <section key={trapType} className="bg-surface border border-line rounded-lg p-4 mb-4">
              <p className="survey-caption">{TRAP_LABEL[trapType]} · {season}</p>
              <h2 className="text-base font-semibold text-ink mt-0.5 mb-3">
                Peak catch per trap, by week
              </h2>
              <div className="overflow-x-auto">
                <div className="min-w-[28rem]">
                  <Histogram
                    ariaLabel={`Weekly peak ${TRAP_LABEL[trapType]} catch per trap for ${season}`}
                    buckets={weeks.map((w) => ({
                      label: weekLabel(w.weekStart),
                      count: w.peakPerTrap,
                    }))}
                    threshold={
                      t ? { value: t.count, label: `${t.count}+ per trap → ${t.title}` } : undefined
                    }
                  />
                </div>
              </div>
              <Link
                href={`/orchard/${orchard.id}/pests/${TRAP_TARGET[trapType]}`}
                className="text-xs text-canopy-700 dark:text-canopy-100 hover:underline"
              >
                About {TRAP_LABEL[trapType].toLowerCase()} catches →
              </Link>
            </section>
          );
        })}

        <TrapsClient
          orchardId={orchard.id}
          traps={traps}
          today={today}
          canEdit={canEdit}
          notes={TRAP_NOTE}
          labels={TRAP_LABEL}
        />
      </div>
    </main>
  );
}
