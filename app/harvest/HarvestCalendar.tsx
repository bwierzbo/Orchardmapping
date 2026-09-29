'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { HarvestPlanRow } from '@/lib/db/harvest-plan';
import { HARVEST_PURPOSES, PURPOSE_WINDOW, type HarvestPurpose } from '@/lib/harvest-target';
import { certaintyOf, predictHarvest, type Certainty } from '@/lib/harvest-predict';

/**
 * The picking calendar: one bar per variety, across the season.
 *
 * Bars are read at a glance, so what they cannot support has to be visible
 * in them. Colour is certainty, not species: a window resting on a bloom
 * nobody recorded and the word "Late" must not look like one measured at a
 * station. Varieties the library has no window for get no bar at all and
 * are listed underneath, because an absent bar is a question and a
 * guessed one is an answer.
 */

const MONTHS = [
  { m: 7, label: 'Aug' },
  { m: 8, label: 'Sep' },
  { m: 9, label: 'Oct' },
  { m: 10, label: 'Nov' },
];

const CERTAINTY_STYLE: Record<Certainty, { bar: string; dot: string; label: string }> = {
  measured: { bar: 'bg-canopy-600', dot: 'bg-canopy-800', label: 'Measured' },
  derived: { bar: 'bg-canopy-600/55', dot: 'bg-canopy-700', label: 'Derived' },
  guessed: { bar: 'bg-canopy-600/25', dot: 'bg-canopy-600/60', label: 'Season word only' },
};

interface Props {
  rows: HarvestPlanRow[];
  year: number;
  defaultPurpose: HarvestPurpose;
  orchards: { id: string; name: string }[];
  selectedOrchardId: string | null;
  /**
   * Now, from the server. Read here it would be an impure call during
   * render, and the server and the client would disagree about where the
   * line goes; the page is dynamic, so the server's answer is current.
   */
  todayMs: number;
}

export default function HarvestCalendar({
  rows,
  year,
  defaultPurpose,
  orchards,
  selectedOrchardId,
  todayMs,
}: Props) {
  const [purpose, setPurpose] = useState<HarvestPurpose>(defaultPurpose);

  // The axis is fixed to the picking season rather than fitted to the data,
  // so switching orchard or purpose does not rescale the chart under you.
  const axisStart = Date.UTC(year, 7, 1);
  const axisEnd = Date.UTC(year, 10, 30);
  const span = axisEnd - axisStart;
  const pct = (t: number) => ((t - axisStart) / span) * 100;

  const { bars, untargeted } = useMemo(() => {
    const withTarget = rows.filter((r) => r.daysFromBloom != null && r.basis != null);
    const bars = withTarget
      .map((r) => {
        const prediction = predictHarvest({
          daysFromBloom: r.daysFromBloom!,
          basis: r.basis!,
          purpose,
          year,
          bloom: r.bloom ? new Date(`${r.bloom}T00:00:00Z`) : null,
        });
        return { row: r, prediction, certainty: certaintyOf(prediction) };
      })
      .sort(
        (a, b) =>
          a.prediction.window.start.getTime() - b.prediction.window.start.getTime() ||
          a.row.variety.localeCompare(b.row.variety)
      );
    return { bars, untargeted: rows.filter((r) => r.daysFromBloom == null) };
  }, [rows, purpose, year]);

  const todayInRange = todayMs >= axisStart && todayMs <= axisEnd;

  const orchardHref = (id: string | null) =>
    id ? `/harvest?orchard=${encodeURIComponent(id)}` : '/harvest';

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line overflow-hidden">
          {HARVEST_PURPOSES.map((p) => (
            <button
              key={p}
              onClick={() => setPurpose(p)}
              className={`px-3 py-1.5 text-sm font-medium ${
                purpose === p ? 'bg-canopy-600 text-white' : 'bg-surface text-ink hover:bg-canopy-50'
              }`}
            >
              {p === 'cider' ? 'For cider' : 'For eating'}
            </button>
          ))}
        </div>

        <select
          value={selectedOrchardId ?? ''}
          onChange={(e) => {
            window.location.href = orchardHref(e.target.value || null);
          }}
          className="text-sm px-2.5 py-1.5 bg-surface text-ink border border-line rounded-md"
          aria-label="Orchard"
        >
          <option value="">All my orchards</option>
          {orchards.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        <span className="text-xs text-bark">
          {bars.length} varieties with a window
          {untargeted.length > 0 ? `, ${untargeted.length} without` : ''}
        </span>
      </div>

      <p className="text-[11px] text-bark/80">
        Picking runs from full bloom, not from the calendar.{' '}
        {purpose === 'cider'
          ? `Cider windows open ${PURPOSE_WINDOW.cider.leadDays} days before the predicted date and stay open ${PURPOSE_WINDOW.cider.tailDays} after, because early is the failure and fruit off the ground still presses.`
          : `Eating windows run ${PURPOSE_WINDOW.fresh.leadDays} days either side — fruit picked late softens in store.`}
      </p>

      {/* Chart */}
      <div className="border border-line rounded-lg bg-surface overflow-hidden">
        {/* Month header */}
        <div className="relative h-7 border-b border-line bg-paper">
          {MONTHS.map(({ m, label }) => (
            <div
              key={m}
              className="absolute top-0 h-full border-l border-line/70 pl-1.5 text-[11px] leading-7 text-bark"
              style={{ left: `${pct(Date.UTC(year, m, 1))}%` }}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="relative">
          {/* Month gridlines behind every row */}
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
            {MONTHS.map(({ m }) => (
              <div
                key={m}
                className="absolute top-0 bottom-0 border-l border-line/50"
                style={{ left: `${pct(Date.UTC(year, m, 1))}%` }}
              />
            ))}
            {todayInRange && (
              <div
                className="absolute top-0 bottom-0 border-l-2 border-flag-600"
                style={{ left: `${pct(todayMs)}%` }}
                title="Today"
              />
            )}
          </div>

          {bars.length === 0 ? (
            <p className="relative z-10 px-4 py-8 text-center text-sm text-bark">
              Nothing with a harvest window is planted here yet.
            </p>
          ) : (
            <ul className="relative z-10 divide-y divide-line/60">
              {bars.map(({ row, prediction, certainty }) => {
                const style = CERTAINTY_STYLE[certainty];
                const left = pct(prediction.window.start.getTime());
                const right = pct(prediction.window.end.getTime());
                return (
                  <li key={row.variety} className="relative h-9 group">
                    {/* The bar */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 h-4 rounded ${style.bar}`}
                      style={{
                        left: `${Math.max(0, left)}%`,
                        width: `${Math.max(0.6, Math.min(100, right) - Math.max(0, left))}%`,
                      }}
                      title={`${row.variety} — ${prediction.note}`}
                    />
                    {/* The predicted date itself */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 w-1 h-4 rounded-sm ${style.dot}`}
                      style={{ left: `${pct(prediction.window.centre.getTime())}%` }}
                    />
                    {/* Name, over the bar, readable against it */}
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-medium text-ink drop-shadow-[0_1px_0_rgba(255,255,255,0.8)] dark:drop-shadow-[0_1px_0_rgba(0,0,0,0.6)] pointer-events-none">
                      {row.variety}
                      <span className="ml-1.5 text-bark font-normal">
                        {row.treeCount}
                        {row.orchardCount > 1 ? ` · ${row.orchardCount} orchards` : ''}
                      </span>
                      {prediction.lateSeasonRisk && (
                        <AlertTriangle
                          aria-label="Window runs past the point the season reliably ripens fruit here"
                          size={11}
                          className="inline ml-1.5 -mt-0.5 text-flag-600"
                        />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-bark">
        {(Object.keys(CERTAINTY_STYLE) as Certainty[]).map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className={`inline-block w-6 h-2.5 rounded ${CERTAINTY_STYLE[c].bar}`} />
            {CERTAINTY_STYLE[c].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle size={11} className="text-flag-600" /> May not ripen here most years
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-0.5 h-3 bg-flag-600" /> Today
        </span>
      </div>

      {untargeted.length > 0 && (
        <details className="border border-line rounded-lg bg-surface p-4">
          <summary className="text-sm font-medium text-ink cursor-pointer">
            {untargeted.length} varieties with no harvest window recorded
          </summary>
          <p className="text-xs text-bark mt-2 mb-3">
            These are planted here but the variety library has nothing to say about when they
            ripen, so they get no bar rather than a guessed one. Adding a harvest window to the
            variety puts it on the calendar.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-bark">
            {untargeted.map((r) => (
              <li key={r.variety}>
                <Link
                  href={`/varieties/${encodeURIComponent(r.variety)}`}
                  className="hover:text-ink hover:underline"
                >
                  {r.variety}
                </Link>
                <span className="text-bark/60"> ·{r.treeCount}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
