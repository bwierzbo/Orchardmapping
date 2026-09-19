import type { ResolvedStep, StepCategory, StepStatus } from '@/lib/ipm-schedule';
import { barFor, monthTicks, pctOfYear } from '@/lib/season-timeline';
import { formatYMD } from '@/lib/dates';

/**
 * The program as one year-long axis, a lane per category.
 *
 * An IPM year has a shape — disease-led autumn, copper and sulfur in
 * spring, monitor-only summer — and seeing that shape is the point. The
 * lanes carry the category, so colour is free to carry STATUS, which is
 * the question being asked of the chart: what is open, what is done,
 * what is still ahead.
 */

const CATEGORY_LABEL: Record<StepCategory, string> = {
  disease: 'Disease',
  insect: 'Insect',
  sanitation: 'Sanitation',
  monitoring: 'Monitoring',
};

const LANES: StepCategory[] = ['disease', 'insect', 'sanitation', 'monitoring'];

/** Status → fill. Never the tree status palette; different question. */
const STATUS_FILL: Record<StepStatus, string> = {
  due: 'bg-flag-600',
  done: 'bg-canopy-600',
  upcoming: 'bg-canopy-600',
  monitor: 'bg-bark',
  past: 'bg-bark',
  waiting: 'bg-bark',
};

const STATUS_OPACITY: Record<StepStatus, string> = {
  due: 'opacity-100',
  done: 'opacity-55',
  upcoming: 'opacity-80',
  monitor: 'opacity-45',
  past: 'opacity-25',
  waiting: 'opacity-25',
};

export interface TimelineMarker {
  ymd: string;
  label: string;
  /** Growth stages and degree-day milestones read differently. */
  kind: 'stage' | 'degree_day';
}

export default function SeasonTimeline({
  steps,
  season,
  today,
  markers,
}: {
  steps: ResolvedStep[];
  season: number;
  today: string;
  markers: TimelineMarker[];
}) {
  const months = monthTicks(season);
  const todayPct = pctOfYear(today, season);
  const showToday = Number(today.slice(0, 4)) === season;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[44rem]">
        {/* Month axis */}
        <div className="relative h-5 ml-24 border-b border-line">
          {months.map((m) => (
            <span
              key={m.name}
              title={m.name}
              className="absolute font-mono text-[10px] text-bark -translate-x-1/2"
              style={{ left: `${m.pct + 100 / 24}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>

        {LANES.map((category) => {
          const lane = steps.filter((s) => s.step.category === category);
          if (lane.length === 0) return null;
          return (
            <section key={category} className="flex border-b border-line last:border-b-0">
              <h3 className="w-24 shrink-0 py-2 pr-2 font-mono text-[10px] uppercase tracking-widest text-bark">
                {CATEGORY_LABEL[category]}
              </h3>
              <div className="relative flex-1 py-1.5">
                {/* Month gridlines, behind the bars */}
                {months.map((m) => (
                  <span
                    key={m.name}
                    aria-hidden
                    className="absolute inset-y-0 border-l border-line/60"
                    style={{ left: `${m.pct}%` }}
                  />
                ))}
                {showToday && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 border-l-2 border-flag-600/70"
                    style={{ left: `${todayPct}%` }}
                  />
                )}

                <ul className="relative space-y-1">
                  {lane.map((r) => {
                    const bar = barFor(r.start, r.end, season);
                    const window = r.start
                      ? `${formatYMD(r.start)} → ${r.end ? formatYMD(r.end) : 'open'}`
                      : r.why;
                    return (
                      <li key={r.step.key} className="relative h-5">
                        {bar ? (
                          <span
                            title={`${r.step.title} · ${r.status} · ${window}`}
                            className={`absolute top-0 h-5 flex items-center px-1.5 ${
                              STATUS_FILL[r.status]
                            } ${STATUS_OPACITY[r.status]} ${
                              bar.clippedStart ? '' : 'rounded-l-[3px]'
                            } ${bar.clippedEnd ? '' : 'rounded-r-[3px]'}`}
                            style={{ left: `${bar.startPct}%`, width: `${bar.widthPct}%` }}
                          >
                            <span className="truncate text-[10px] text-white dark:text-paper">
                              {r.step.title}
                            </span>
                          </span>
                        ) : (
                          // No date to draw: say why, rather than leaving
                          // a silent gap in the lane.
                          <span className="absolute left-0 top-0 h-5 flex items-center text-[10px] text-bark italic">
                            {r.step.title} — {r.why.toLowerCase()}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          );
        })}

        {/* Stage and degree-day ticks, on their own rail under the lanes */}
        {markers.length > 0 && (
          <div className="flex pt-2">
            <span className="w-24 shrink-0 pr-2 font-mono text-[10px] uppercase tracking-widest text-bark">
              Reached
            </span>
            <div className="relative flex-1 h-9">
              {markers.map((m) => (
                <span
                  key={`${m.kind}-${m.label}-${m.ymd}`}
                  title={`${m.label} · ${formatYMD(m.ymd)}`}
                  className="absolute top-0 flex flex-col items-center -translate-x-1/2"
                  style={{ left: `${pctOfYear(m.ymd, season)}%` }}
                >
                  <span
                    aria-hidden
                    className={`h-2.5 border-l ${
                      m.kind === 'stage' ? 'border-canopy-600' : 'border-flag-600'
                    }`}
                  />
                  <span className="font-mono text-[9px] text-bark whitespace-nowrap [writing-mode:vertical-rl]">
                    {m.label}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
