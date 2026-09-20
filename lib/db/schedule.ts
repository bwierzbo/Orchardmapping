import { listProgramSteps, listCompletions } from './program';
import { applicationHistory } from './spray';
import { seasonCatches } from './traps';
import { listPostures, listMaterialKickback } from './posture';
import { infectionPeriods } from '../scab';
import { listMarks } from './phenology';
import { getHours } from './weather';
import { ddCrossingDates } from '../gdd';
import {
  biofixDate,
  ddModelOf,
  resolveProgram,
  type DegreeDayTrigger,
  type MaterialApplication,
  type InfectionWindow,
  type ResolvedStep,
} from '../ipm-schedule';
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

  const [steps, marks, completions, sprays, trapCatches, postures, kickback] =
    await Promise.all([
      listProgramSteps(orchardId),
      listMarks(orchardId),
      listCompletions(orchardId, season).catch(() => []),
      // A recorded spray completes the step that called for it, so the
      // work is never entered twice. 400 days covers a wrapped window.
      applicationHistory(orchardId, 400).catch(() => []),
      seasonCatches(orchardId, season).catch(() => []),
      listPostures(orchardId).catch(() => []),
      listMaterialKickback().catch(() => []),
    ]);
  const kickbackBy = new Map(kickback.map((k) => [k.materialKey, k.postInfectionHours]));

  const applications: MaterialApplication[] = sprays.map((a) => ({
    materialKey: a.material_key,
    appliedOn: a.applied_on,
  }));


  // Only fetch weather when a degree-day step actually needs it — a
  // programme with none should not pull a year of hours to find out.
  const ddTriggers = steps
    .filter((s) => s.trigger.type === 'degree_day')
    .map((s) => s.trigger as DegreeDayTrigger);

  /**
   * One accumulation pass per distinct MODEL, not per step.
   *
   * Steps sharing a model and a start date share a pass, so three
   * codling moth thresholds cost what one did. A biofix model needs its
   * own pass because it starts from a different date — and that date
   * comes from the orchard's own trap catches.
   */
  const crossings = new Map<string, Map<number, string | null>>();
  const modelKey = (t: DegreeDayTrigger, biofix: string | null) => {
    const m = ddModelOf(t);
    return `${m.base}/${m.cutoff}/${biofix ?? 'jan1'}`;
  };
  const biofixOf = (t: DegreeDayTrigger) =>
    t.from === 'biofix' && t.biofixTrap
      ? biofixDate(trapCatches, t.biofixTrap, season)
      : null;

  if (ddTriggers.length > 0) {
    const hours = await getHours(orchardId, `${season}-01-01`, asOfYmd).catch(() => []);
    const groups = new Map<string, { t: DegreeDayTrigger; biofix: string | null; dds: number[] }>();
    for (const t of ddTriggers) {
      const biofix = biofixOf(t);
      // A biofix model with no biofix yet has nothing to accumulate
      // from; the resolver reports that state rather than guessing.
      if (t.from === 'biofix' && !biofix) continue;
      const key = modelKey(t, biofix);
      const g = groups.get(key) ?? { t, biofix, dds: [] };
      g.dds.push(t.dd);
      groups.set(key, g);
    }
    for (const [key, g] of groups) {
      crossings.set(key, ddCrossingDates(hours, g.dds, ddModelOf(g.t), g.biofix));
    }
  }

  // Infection events, for the condition steps. Only computed when a
  // condition step exists — a programme without one should not pull a
  // season of hours to find that out.
  let infectionEvents: InfectionWindow[] = [];
  if (steps.some((s) => s.trigger.type === 'condition')) {
    const hours = await getHours(orchardId, `${season}-01-01`, asOfYmd).catch(() => []);
    infectionEvents = infectionPeriods(hours, 'light').map((p) => ({
      startTs: p.startTs,
      endTs: p.endTs,
      severity: p.severity as InfectionWindow['severity'],
      // Everything from stored hours has already happened. Forecast
      // events would arrive from the same model over forecast hours,
      // which is not wired yet.
      forecast: false,
    }));
  }

  return resolveProgram({
    steps,
    season,
    asOfYmd,
    postures,
    infectionEvents,
    kickbackHours: (m) => kickbackBy.get(m) ?? null,
    marks: marks.map((m) => ({ stage: m.stage, observedOn: m.observedOn })),
    ddDate: (trigger, biofix) =>
      crossings.get(modelKey(trigger, biofix))?.get(trigger.dd) ?? null,
    completions,
    applications,
    trapCatches,
  });
}

export interface ScheduleSummary {
  /** Steps whose window is open today. */
  due: number;
  /** Standing watches — conditions and traps. */
  monitor: number;
  /** The most urgent open step, for a one-line prompt. */
  leadTitle: string | null;
  /** Steps that cannot be placed because a stage is unmarked. */
  waitingOnAStage: number;
}

/**
 * Enough of the schedule to put on the map without reading all of it.
 *
 * The map is the landing page and must not wait on a year of weather to
 * paint, so this is fetched client-side after the tiles — the counts
 * appear a moment later rather than blocking the map.
 */
export async function summariseSchedule(
  orchardId: string,
  asOfYmd?: string
): Promise<ScheduleSummary> {
  const steps = await resolveSchedule(orchardId, asOfYmd);
  const due = steps.filter((s) => s.status === 'due');
  return {
    due: due.length,
    monitor: steps.filter((s) => s.status === 'monitor').length,
    leadTitle: due[0]?.step.title ?? null,
    waitingOnAStage: steps.filter((s) => s.status === 'waiting').length,
  };
}
