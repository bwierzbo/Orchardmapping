import { type PhenologyMark, type PhenologyStage, seasonOf, stageDate } from './phenology';
import type { TrapCatch } from './traps';
import { hoursRemaining, kickbackDeadline, type PestPosture } from './posture';

/**
 * Turning a program into dates.
 *
 * A step in an IPM program is almost never "do this on April 12". It is
 * anchored to something that moves: a growth stage, an accumulated
 * degree-day total, a season-long window, or a condition you can only
 * watch for. This module holds those trigger shapes and the resolver
 * that places them on this season's calendar.
 *
 * Everything here is pure. Weather and stage marks are fetched by the
 * caller and passed in, so the whole model is testable without a
 * database or a network.
 */

export const STEP_CATEGORIES = ['disease', 'insect', 'sanitation', 'monitoring'] as const;
export type StepCategory = (typeof STEP_CATEGORIES)[number];

/** A fixed part of the year — "copper before the autumn rains". */
export interface CalendarTrigger {
  type: 'calendar';
  /** MM-DD. A window whose end is before its start wraps the new year. */
  start: string;
  end: string;
}

/**
 * An accumulated heat total.
 *
 * Every insect has its own thresholds and its own starting point, and
 * one model for all of them mistimes everything except the pest it was
 * written for. Codling moth runs base 50°F / cutoff 88°F from January 1
 * — the no-biofix variant, valid north of 46°N. Leafrollers run base
 * 41°F / cutoff 85°F from a BIOFIX: the day a pheromone trap first
 * catches, which only this orchard's own traps can supply.
 */
export interface DegreeDayTrigger {
  type: 'degree_day';
  dd: number;
  /** Lower developmental threshold, °F. Defaults to codling moth's 50. */
  base?: number;
  /** Upper horizontal cutoff, °F. Defaults to codling moth's 88. */
  cutoff?: number;
  /**
   * Where accumulation starts. 'jan1' is the no-biofix variant;
   * 'biofix' counts from the first catch on `biofixTrap`, and the step
   * cannot be placed until that trap has caught something.
   */
  from?: 'jan1' | 'biofix';
  /** Trap type whose first catch sets the biofix. */
  biofixTrap?: string;
  /** Days the window stays open past the threshold being crossed. */
  windowDays?: number;
}

/** The model a trigger asks for, with codling moth as the default. */
export function ddModelOf(t: DegreeDayTrigger): { base: number; cutoff: number } {
  return { base: t.base ?? 50, cutoff: t.cutoff ?? 88 };
}

/**
 * The first catch of the season on a trap type — the biofix.
 *
 * Any catch at all, not a threshold: biofix marks the start of flight,
 * which is a different question from whether the flight is heavy enough
 * to act on.
 */
export function biofixDate(
  catches: readonly TrapCatch[],
  trapType: string,
  season: number
): string | null {
  let first: string | null = null;
  for (const c of catches) {
    if (c.trapType !== trapType || c.count <= 0) continue;
    if (seasonOf(c.countedOn) !== season) continue;
    if (!first || c.countedOn < first) first = c.countedOn;
  }
  return first;
}

/** Anchored to a growth stage, optionally running until a later one. */
export interface PhenologyTrigger {
  type: 'phenology';
  stage: PhenologyStage;
  /** Days after the stage the window opens. Negative is not supported:
   *  you cannot act before an observation you have not made yet. */
  offsetDays?: number;
  /** Closes at this later stage; otherwise windowDays after opening. */
  untilStage?: PhenologyStage;
  windowDays?: number;
}

/**
 * Something you watch for rather than schedule. A scab infection period
 * cannot be put on a calendar — it either happens or it doesn't — so
 * these resolve to a standing watch over an active window, never a date.
 */
export interface ConditionTrigger {
  type: 'condition';
  kind: 'scab_infection' | 'dry_spell';
  /** The watch is only live between these stages, when given. */
  fromStage?: PhenologyStage;
  untilStage?: PhenologyStage;
}

/** Act on evidence: a trap count crossing a number. */
export interface ThresholdTrigger {
  type: 'threshold';
  trap: string;
  count: number;
  /**
   * Days after the last qualifying catch before the step goes quiet
   * again. Without this a step opened by one catch in July was still
   * demanding a spray in late September, long after the flight ended
   * and the traps had gone back to zero.
   */
  staleAfterDays?: number;
}

export type Trigger =
  | CalendarTrigger
  | DegreeDayTrigger
  | PhenologyTrigger
  | ConditionTrigger
  | ThresholdTrigger;

export interface ProgramStep {
  key: string;
  title: string;
  detail: string;
  category: StepCategory;
  /** pest_library key this step addresses, when it addresses one. */
  pestKey: string | null;
  /** spray_materials key this step suggests, when it suggests one. */
  materialKey: string | null;
  trigger: Trigger;
  /** Days before a recurring step falls due again. Null = once a season.
   *  Canker scouting is monthly; lime sulfur repeats on wetness. */
  repeatDays: number | null;
  sortOrder: number;
}

/** A step recorded as done — explicitly, or by a matching spray. */
export interface StepCompletion {
  stepKey: string;
  /** Local YYYY-MM-DD. */
  completedOn: string;
}

/** A recorded spray, used to complete the step that called for it. */
export interface MaterialApplication {
  materialKey: string | null;
  /** Local YYYY-MM-DD. */
  appliedOn: string;
}

export type StepStatus =
  /** Done for now: once-a-season steps stay done; recurring steps come
   *  back when their repeat interval is up. */
  | 'done'
  /** Window is open today. */
  | 'due'
  /** Window computed and still ahead. */
  | 'upcoming'
  /** Window closed before today. */
  | 'past'
  /** A standing watch, currently live. */
  | 'monitor'
  /** Cannot be placed yet — the stage isn't marked, or the heat hasn't
   *  accumulated. Not a problem; just not knowable. */
  | 'waiting';

export interface ResolvedStep {
  step: ProgramStep;
  status: StepStatus;
  /** Local YYYY-MM-DD, or null for a watch or an unplaceable step. */
  start: string | null;
  /** Null when the window is open-ended — a step that runs until a
   *  stage that has not been marked yet. */
  end: string | null;
  /** Plain-language reason the step sits where it does. */
  why: string;
  /** Days until the window opens; negative once open or past. Null when
   *  there is no date. Sorting key for "what is coming up". */
  daysUntil: number | null;
  /** When the step was last done this season, if it was. */
  lastDoneOn: string | null;
  /** For a recurring step that is done for now, when it comes back. */
  dueAgainOn: string | null;
}

/** "half_inch_green" → "half inch green", for reasons a grower reads. */
function stageWords(stage: string): string {
  return stage.replace(/_/g, ' ');
}

function addDays(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function daysBetweenUtc(fromYmd: string, toYmd: string): number {
  return Math.round(
    (Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000
  );
}

/**
 * A calendar window for a season. A window whose end month-day is
 * before its start wraps into the next year — "excise cankers Nov
 * through Feb" is one window, not two.
 */
export function calendarWindow(
  trigger: CalendarTrigger,
  season: number
): { start: string; end: string } {
  const start = `${season}-${trigger.start}`;
  const end =
    trigger.end >= trigger.start ? `${season}-${trigger.end}` : `${season + 1}-${trigger.end}`;
  return { start, end };
}

function statusFor(start: string, end: string, asOfYmd: string): StepStatus {
  if (asOfYmd < start) return 'upcoming';
  if (asOfYmd > end) return 'past';
  return 'due';
}

export interface ResolveInput {
  steps: readonly ProgramStep[];
  season: number;
  asOfYmd: string;
  marks: readonly PhenologyMark[];
  /**
   * Date the running total for THIS trigger's model crossed its
   * threshold, or null if it hasn't. The caller precomputes one pass per
   * distinct model rather than one per step — see lib/db/schedule.ts.
   */
  ddDate: (trigger: DegreeDayTrigger, biofixYmd: string | null) => string | null;
  /** Explicit "I did this" records for the season. */
  completions?: readonly StepCompletion[];
  /** Sprays recorded this season. One whose material is the step's
   *  suggested material, applied inside the step's window, completes it
   *  — recording the spray IS recording the work. */
  applications?: readonly MaterialApplication[];
  /** Trap counts, which is how a threshold step learns it is live. */
  trapCatches?: readonly TrapCatch[];
  /** How this orchard has chosen to answer each pest. */
  postures?: readonly PestPosture[];
  /**
   * Infection events from the disease model, observed and forecast.
   * A condition step is only actionable because of these.
   */
  infectionEvents?: readonly InfectionWindow[];
  /** Hours a material still works after infection starts, or null. */
  kickbackHours?: (materialKey: string) => number | null;
  /** Local "YYYY-MM-DDTHH:mm" — needed to count down a kickback window. */
  nowTs?: string;
}

export interface InfectionWindow {
  startTs: string;
  endTs: string;
  severity: 'light' | 'moderate' | 'severe';
  /** True for an event the forecast says is coming, not one that ran. */
  forecast?: boolean;
}

/**
 * The most recent date this step counts as done, or null.
 *
 * Two sources, deliberately treated as one: an explicit completion, and
 * a spray of the step's own material inside the step's window. A spray
 * outside the window belongs to a different step that uses the same
 * material — copper appears twice in the program, in autumn and at
 * half-inch green, and one application must not tick off both.
 */
function lastDone(
  step: ProgramStep,
  window: { start: string | null; end: string | null },
  input: ResolveInput
): string | null {
  let latest: string | null = null;
  const keep = (d: string) => {
    if (!latest || d > latest) latest = d;
  };

  for (const c of input.completions ?? []) {
    if (c.stepKey === step.key) keep(c.completedOn);
  }

  if (step.materialKey && window.start) {
    for (const a of input.applications ?? []) {
      if (a.materialKey !== step.materialKey) continue;
      if (a.appliedOn < window.start) continue;
      if (window.end && a.appliedOn > window.end) continue;
      keep(a.appliedOn);
    }
  }
  return latest;
}

/**
 * Evidence dated after the as-of date has not happened yet.
 *
 * The live app always asks about today, so this never bit in normal
 * use — but every retrospective view was wrong: replaying April showed
 * a step completed by a July spray and a trap threshold tripped by a
 * catch three months in the future. Filtering here rather than in the
 * caller makes it true for every caller.
 */
function asOf<T>(rows: readonly T[] | undefined, date: (row: T) => string, asOfYmd: string): T[] {
  return (rows ?? []).filter((r) => date(r).slice(0, 10) <= asOfYmd);
}

/** Place one step on the season's calendar. */
export function resolveStep(step: ProgramStep, rawInput: ResolveInput): ResolvedStep {
  const input: ResolveInput = {
    ...rawInput,
    completions: asOf(rawInput.completions, (c) => c.completedOn, rawInput.asOfYmd),
    applications: asOf(rawInput.applications, (a) => a.appliedOn, rawInput.asOfYmd),
    trapCatches: asOf(rawInput.trapCatches, (c) => c.countedOn, rawInput.asOfYmd),
    infectionEvents: asOf(rawInput.infectionEvents, (e) => e.startTs, rawInput.asOfYmd),
  };
  const { season, asOfYmd, marks, ddDate } = input;
  const t = step.trigger;
  const placed = (start: string, end: string, why: string): ResolvedStep =>
    withCompletion({
      step,
      status: statusFor(start, end, asOfYmd),
      start,
      end,
      why,
      daysUntil: daysBetweenUtc(asOfYmd, start),
      lastDoneOn: null,
      dueAgainOn: null,
    });
  const unplaceable = (why: string): ResolvedStep => ({
    step,
    status: 'waiting',
    start: null,
    end: null,
    why,
    daysUntil: null,
    lastDoneOn: null,
    dueAgainOn: null,
  });
  /** Open at `start`, closing on an event that hasn't happened yet. */
  const openEnded = (start: string, why: string): ResolvedStep =>
    withCompletion({
      step,
      status: asOfYmd < start ? 'upcoming' : 'due',
      start,
      end: null,
      why,
      daysUntil: daysBetweenUtc(asOfYmd, start),
      lastDoneOn: null,
      dueAgainOn: null,
    });

  /**
   * Fold completion into a placed step. Only an OPEN step can be marked
   * done — something upcoming or already past keeps its own status, and
   * still reports when it was last done so the history stays visible.
   */
  const withCompletion = (r: ResolvedStep): ResolvedStep => {
    const done = lastDone(step, { start: r.start, end: r.end }, input);
    if (!done) return r;
    const dueAgainOn = step.repeatDays ? addDays(done, step.repeatDays) : null;
    // A recurring step comes back when its interval is up; a
    // once-a-season step stays done for the rest of the season.
    const stillDone = !dueAgainOn || asOfYmd < dueAgainOn;
    return {
      ...r,
      status: r.status === 'due' && stillDone ? 'done' : r.status,
      lastDoneOn: done,
      dueAgainOn,
    };
  };

  switch (t.type) {
    case 'calendar': {
      const w = calendarWindow(t, season);
      return placed(w.start, w.end, `Calendar window ${t.start} to ${t.end}`);
    }

    case 'degree_day': {
      const model = ddModelOf(t);
      let biofix: string | null = null;
      if (t.from === 'biofix') {
        if (!t.biofixTrap) return unplaceable('No biofix trap set for this step');
        biofix = biofixDate(input.trapCatches ?? [], t.biofixTrap, season);
        if (!biofix) {
          return unplaceable(
            `Waiting on the first ${stageWords(t.biofixTrap)} catch to set the biofix`
          );
        }
      }
      const from = biofix ? `biofix ${biofix}` : 'Jan 1';
      const hit = ddDate(t, biofix);
      if (!hit) {
        return unplaceable(
          `Waiting on ${t.dd} degree-days (base ${model.base}°F from ${from})`
        );
      }
      const end = addDays(hit, t.windowDays ?? 7);
      return placed(hit, end, `${t.dd} DD base ${model.base}°F from ${from} — reached ${hit}`);
    }

    case 'phenology': {
      const anchor = stageDate(marks, t.stage, season);
      if (!anchor) return unplaceable(`Waiting on ${stageWords(t.stage)} to be marked`);
      const start = addDays(anchor, t.offsetDays ?? 0);

      if (t.untilStage) {
        const until = stageDate(marks, t.untilStage, season);
        // An unmarked closing stage means the window is still OPEN, not
        // that it lasted a default fortnight. Closing primary scab 14
        // days after green tip because petal fall wasn't recorded yet
        // would be wrong by about six weeks.
        if (!until) return openEnded(start, `${stageWords(t.stage)} until ${stageWords(t.untilStage)} is marked`);
        return placed(start, until, `${stageWords(t.stage)} to ${stageWords(t.untilStage)}`);
      }

      const end = addDays(start, t.windowDays ?? 14);
      const why = t.offsetDays
        ? `${t.offsetDays} days after ${stageWords(t.stage)}`
        : `At ${stageWords(t.stage)}`;
      return placed(start, end, why);
    }

    case 'condition': {
      // A watch is live between its bounding stages, if it has them.
      const from = t.fromStage ? stageDate(marks, t.fromStage, season) : null;
      if (t.fromStage && !from) {
        return unplaceable(`Watch starts at ${stageWords(t.fromStage)}`);
      }
      const until = t.untilStage ? stageDate(marks, t.untilStage, season) : null;
      const live = (!from || asOfYmd >= from) && (!until || asOfYmd <= until);
      const watching = (why: string, status: StepStatus = 'monitor'): ResolvedStep => ({
        step,
        status,
        start: from,
        end: until,
        why,
        daysUntil: from ? daysBetweenUtc(asOfYmd, from) : null,
        lastDoneOn: null,
        dueAgainOn: null,
      });

      if (!live) {
        return watching(
          'Outside the watch window',
          from && asOfYmd < from ? 'upcoming' : 'past'
        );
      }

      // The posture decides what a watch DOES when conditions occur.
      const posture = step.pestKey
        ? input.postures?.find((p) => p.pestKey === step.pestKey)
        : undefined;
      if (posture?.posture === 'off') {
        return watching('Not treating this — recorded as a decision', 'past');
      }

      const rank = { light: 1, moderate: 2, severe: 3 } as const;
      const floor = rank[posture?.minSeverity ?? 'moderate'];
      const inWindow = (input.infectionEvents ?? []).filter(
        (e) =>
          rank[e.severity] >= floor &&
          e.startTs.slice(0, 10) >= (from ?? '0000-00-00') &&
          (!until || e.startTs.slice(0, 10) <= until)
      );

      // PROTECT: the next forecast event is the deadline to be covered.
      if (posture?.posture === 'protect') {
        const ahead = inWindow
          .filter((e) => e.forecast && e.startTs.slice(0, 10) >= asOfYmd)
          .sort((a, b) => a.startTs.localeCompare(b.startTs))[0];
        if (!ahead) return watching('Watching the forecast — nothing coming yet');
        return {
          ...watching(`${ahead.severity} infection forecast for ${ahead.startTs.slice(0, 10)} — be covered before it`),
          status: 'due',
        };
      }

      // REACT: an event has run; the material's kickback sets the clock.
      if (posture?.posture === 'react') {
        const past = inWindow
          .filter((e) => !e.forecast && e.startTs.slice(0, 10) <= asOfYmd)
          .sort((a, b) => b.startTs.localeCompare(a.startTs))[0];
        if (!past) return watching('Watching for an infection period');
        // Two different failures, and conflating them misleads: a step
        // with no material assigned has nothing to time, which is not
        // the same as a material that cannot work after infection.
        if (!step.materialKey) {
          return watching(
            `${past.severity} infection on ${past.startTs.slice(0, 10)} — no material is set on this step, so there is nothing to time`
          );
        }
        const kick = input.kickbackHours?.(step.materialKey) ?? null;
        if (kick === null) {
          return watching(
            `${past.severity} infection on ${past.startTs.slice(0, 10)} — ${stageWords(step.materialKey)} has no post-infection activity, so reacting cannot work. Protect ahead instead.`
          );
        }
        const deadline = kickbackDeadline(past.startTs, kick);
        const left = hoursRemaining(deadline, input.nowTs ?? `${asOfYmd}T12:00`);
        if (left < 0) {
          // The window on THAT event closed; the watch itself has not.
          // Marking it past here stopped it watching for the rest of the
          // season after the first missed event, silently.
          return watching(
            `Watching — the ${kick} h window on the ${past.startTs.slice(0, 10)} infection has closed`
          );
        }
        return {
          ...watching(`${past.severity} infection began ${past.startTs.slice(0, 10)} — ${Math.floor(left)} h left to act`),
          status: 'due',
        };
      }

      // EVIDENCE, or no posture chosen: report, do not instruct.
      const seen = inWindow.filter((e) => !e.forecast).length;
      return watching(
        seen > 0
          ? `Watching conditions — ${seen} infection period${seen === 1 ? '' : 's'} so far`
          : 'Watching conditions'
      );
    }

    case 'threshold': {
      // The FIRST qualifying catch of the season opens the step, and it
      // stays open from there. Once the flight has started it does not
      // un-start: what closes the step is doing the work, and for a
      // material that has to be maintained, repeatDays brings it back.
      const qualifying = [...(input.trapCatches ?? [])]
        .filter(
          (c) =>
            c.trapType === t.trap && c.count >= t.count && seasonOf(c.countedOn) === season
        )
        .sort((a, b) => a.countedOn.localeCompare(b.countedOn));
      const first = qualifying[0];
      const latest = qualifying[qualifying.length - 1];

      // Pressure that stopped weeks ago is not pressure now.
      if (latest && daysBetweenUtc(latest.countedOn, asOfYmd) > (t.staleAfterDays ?? 21)) {
        return {
          step,
          status: 'monitor',
          start: null,
          end: null,
          why: `Quiet since ${latest.countedOn} — watching the traps again`,
          daysUntil: null,
          lastDoneOn: null,
          dueAgainOn: null,
        };
      }

      if (!first) {
        return {
          step,
          status: 'monitor',
          start: null,
          end: null,
          why: `Watching the traps · acts on ${t.count}+ per ${stageWords(t.trap)}`,
          daysUntil: null,
          lastDoneOn: null,
          dueAgainOn: null,
        };
      }
      return openEnded(
        first.countedOn,
        `${first.count} caught per ${stageWords(t.trap)} on ${first.countedOn}`
      );
    }
  }
}

/**
 * Place the whole program, ordered the way a grower reads it: what is
 * open now, then what is being watched, then what is coming, then what
 * cannot be placed yet, then what has passed.
 */
export function resolveProgram(input: ResolveInput): ResolvedStep[] {
  const RANK: Record<StepStatus, number> = {
    due: 0,
    monitor: 1,
    upcoming: 2,
    waiting: 3,
    done: 4,
    past: 5,
  };
  return input.steps
    .map((s) => resolveStep(s, input))
    .sort((a, b) => {
      if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status];
      if (a.daysUntil !== null && b.daysUntil !== null && a.daysUntil !== b.daysUntil) {
        return a.daysUntil - b.daysUntil;
      }
      return a.step.sortOrder - b.step.sortOrder;
    });
}
