import Link from 'next/link';
import { requireOrchardPage } from '@/lib/orchard-page';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { ArrowLeft, CalendarRange } from 'lucide-react';
import { getOrchardConfigById } from '@/lib/db/orchards';
import { resolveSchedule } from '@/lib/db/schedule';
import { listAllProgramSteps } from '@/lib/db/program';
import { listMarks } from '@/lib/db/phenology';
import { getHours } from '@/lib/db/weather';
import { milestoneDates } from '@/lib/gdd';
import { PHENOLOGY_LABEL, seasonOf } from '@/lib/phenology';
import { nowLocalIso } from '@/lib/openmeteo';
import { formatYMD } from '@/lib/dates';
import type { StepStatus } from '@/lib/ipm-schedule';
import SeasonTimeline, { type TimelineMarker } from './SeasonTimeline';
import StepToggle from './StepToggle';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  await requireOrchardPage(id);
  const orchard = await getOrchardConfigById(id).catch(() => null);
  return { title: orchard ? `${orchard.name} — program` : 'Program' };
}

const STATUS_LABEL: Record<StepStatus, string> = {
  due: 'Open now',
  monitor: 'Watching',
  upcoming: 'Ahead',
  waiting: 'Needs a mark',
  done: 'Done',
  past: 'Passed',
};

export default async function ProgramPage({ params }: PageProps) {
  const { id } = await params;
  await requireOrchardPage(id);
  const [orchard, { userId }] = await Promise.all([
    getOrchardConfigById(id).catch(() => null),
    auth(),
  ]);
  if (!orchard) notFound();

  const today = nowLocalIso(orchard.timezone).slice(0, 10);
  const season = seasonOf(today);

  const [schedule, marks, hours, allSteps] = await Promise.all([
    resolveSchedule(orchard.id, today).catch(() => []),
    listMarks(orchard.id).catch(() => []),
    getHours(orchard.id, `${season}-01-01`, today).catch(() => []),
    // Every step, switched off ones included — the timeline shows the
    // plan, this list is where the plan gets decided.
    listAllProgramSteps(orchard.id).catch(() => []),
  ]);
  const resolvedByKey = new Map(schedule.map((r) => [r.step.key, r]));

  // Two kinds of anchor the program hangs off, on one rail: stages the
  // orchard was observed to reach, and heat totals it accumulated.
  const markers: TimelineMarker[] = [
    ...marks
      .filter((m) => seasonOf(m.observedOn) === season)
      .map((m) => ({
        ymd: m.observedOn,
        label: PHENOLOGY_LABEL[m.stage],
        kind: 'stage' as const,
      })),
    ...milestoneDates(hours)
      .filter((m) => m.date !== null)
      .map((m) => ({ ymd: m.date!, label: `${m.dd} DD`, kind: 'degree_day' as const })),
  ];

  const counts = schedule.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }),
    {} as Record<StepStatus, number>,
  );
  const waiting = schedule.filter((r) => r.status === 'waiting');

  return (
    <main className="min-h-dvh bg-paper">
      <div className="max-w-5xl mx-auto px-5 py-8 pb-safe">
        <Link
          href={`/orchard/${orchard.id}/dashboard`}
          className="inline-flex items-center gap-1.5 text-sm text-bark hover:text-ink mb-5"
        >
          <ArrowLeft aria-hidden size={16} /> {orchard.name}
        </Link>

        <div className="flex items-center gap-2 mb-1">
          <CalendarRange className="text-canopy-600" aria-hidden size={22} />
          <h1 className="font-display text-2xl font-semibold text-ink">
            Program · {season}
          </h1>
        </div>
        <p className="text-bark text-sm mb-6 max-w-2xl">
          The year has a shape: disease-led from autumn, copper and sulfur through
          spring, monitor-only in summer. Bars are windows, not appointments — the red
          line is today.
        </p>

        <section className="bg-surface border border-line rounded-lg p-4 mb-5">
          <SeasonTimeline
            steps={schedule}
            season={season}
            today={today}
            markers={markers}
          />
          <p className="survey-caption mt-3">
            {(['due', 'monitor', 'upcoming', 'waiting', 'done', 'past'] as StepStatus[])
              .filter((s) => counts[s])
              .map((s) => `${counts[s]} ${STATUS_LABEL[s].toLowerCase()}`)
              .join(' · ')}
          </p>
        </section>

        {waiting.length > 0 && (
          <section className="bg-surface border border-line rounded-lg p-4 mb-5">
            <h2 className="font-display text-base text-ink">Can&apos;t be placed yet</h2>
            <p className="text-xs text-bark mt-0.5 mb-2">
              Not a problem — these hang off something that hasn&apos;t happened. Marking
              the stage on the dashboard drops them onto the chart.
            </p>
            <ul className="space-y-1">
              {waiting.map((r) => (
                <li key={r.step.key} className="text-sm">
                  <span className="text-ink">{r.step.title}</span>{' '}
                  <span className="text-bark text-xs">— {r.why.toLowerCase()}</span>
                </li>
              ))}
            </ul>
            {userId && (
              <Link
                href={`/orchard/${orchard.id}/dashboard`}
                className="inline-block mt-2 text-sm text-canopy-700 dark:text-canopy-100 hover:underline"
              >
                Mark a growth stage →
              </Link>
            )}
          </section>
        )}

        <section className="bg-surface border border-line rounded-lg p-4">
          <h2 className="font-display text-base text-ink">Every step</h2>
          <p className="text-xs text-bark mt-0.5 mb-2">
            Switch off anything this orchard doesn&apos;t run. It drops out of the
            chart and the due list, and keeps its history for whenever you switch it
            back on.
          </p>
          <ul className="divide-y divide-line">
            {allSteps.map((step) => {
              const r = resolvedByKey.get(step.key);
              return (
                <li
                  key={step.key}
                  className={`py-2.5 flex items-start gap-3 ${step.enabled ? '' : 'opacity-55'}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-ink font-medium">{step.title}</span>
                      {r ? (
                        <span className="font-mono text-[10px] uppercase tracking-widest text-bark">
                          {STATUS_LABEL[r.status]}
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] uppercase tracking-widest text-bark">
                          Not running
                        </span>
                      )}
                      {r?.start && (
                        <span className="font-mono text-[11px] text-bark">
                          {formatYMD(r.start)} → {r.end ? formatYMD(r.end) : 'open'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-bark mt-0.5">{step.detail}</p>
                    {r && (
                      <p className="survey-caption mt-1">
                        {r.why}
                        {r.lastDoneOn && ` · last done ${formatYMD(r.lastDoneOn)}`}
                        {r.dueAgainOn && r.status === 'done' && ` · again ${formatYMD(r.dueAgainOn)}`}
                      </p>
                    )}
                    {step.pestKey && (
                      <Link
                        href={`/orchard/${orchard.id}/pests/${step.pestKey}`}
                        className="text-xs text-canopy-700 dark:text-canopy-100 hover:underline"
                      >
                        What this is for →
                      </Link>
                    )}
                  </div>
                  {userId && (
                    <StepToggle
                      orchardId={orchard.id}
                      stepKey={step.key}
                      enabled={step.enabled}
                      title={step.title}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
