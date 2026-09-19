import { listProgramSteps } from './program';
import { listMarks } from './phenology';
import { getHours } from './weather';
import { ddCrossingDates } from '../gdd';
import { resolveProgram, type ResolvedStep } from '../ipm-schedule';
import { seasonOf } from '../phenology';
import { nowLocalIso } from '../openmeteo';

/**
 * This orchard's program, placed on this season.
 *
 * Assembles the three inputs the resolver needs — the steps, the growth
 * stages actually observed, and the degree-day totals from stored
 * hourly weather — and hands back dated steps. The placing logic itself
 * is pure (lib/ipm-schedule.ts); this is the wiring.
 */
export async function resolveSchedule(
  orchardId: string,
  asOfYmd: string = nowLocalIso().slice(0, 10)
): Promise<ResolvedStep[]> {
  const season = seasonOf(asOfYmd);

  const [steps, marks] = await Promise.all([listProgramSteps(), listMarks(orchardId)]);

  // Only fetch weather when a degree-day step actually needs it — a
  // program with none should not pull a year of hours to find out.
  const thresholds = steps
    .filter((s) => s.trigger.type === 'degree_day')
    .map((s) => (s.trigger as { dd: number }).dd);

  let crossed = new Map<number, string | null>();
  if (thresholds.length > 0) {
    // The no-biofix model accumulates from January 1 — see lib/gdd.ts.
    const hours = await getHours(orchardId, `${season}-01-01`, asOfYmd).catch(() => []);
    crossed = ddCrossingDates(hours, thresholds);
  }

  return resolveProgram({
    steps,
    season,
    asOfYmd,
    marks: marks.map((m) => ({ stage: m.stage, observedOn: m.observedOn })),
    ddDate: (dd) => crossed.get(dd) ?? null,
  });
}
