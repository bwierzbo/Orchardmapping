import type { PhenologyStage } from './phenology';

/**
 * How aggressively an orchard responds to a given threat.
 *
 * This is not a preference dressed up as a setting. It is constrained
 * by chemistry, and the constraint is the point: a material can only be
 * used retroactively if it has POST-INFECTION activity. Lime sulfur
 * does. Wettable sulfur does not — the PNW handbook is explicit that it
 * "has no post-infection activity, unlike liquid lime sulfur
 * formulations" — so a retroactive posture backed by wettable sulfur is
 * not a strategy, it is a spray that arrives too late.
 *
 * The four postures map onto trigger types the resolver already
 * understands, so this adds a decision rather than an engine:
 *
 *   protect   act BEFORE a forecast event. Needs a protectant and a
 *             forecast; Open-Meteo's 16-day horizon supplies the
 *             second, which no station does.
 *   react     act AFTER a confirmed event, inside the material's
 *             kickback window. Needs post-infection activity.
 *   evidence  act on what was found — a trap count, a scouting count.
 *   off       do not act. A recorded decision, which is a different
 *             thing from an oversight, and the coverage check knows it.
 */

export const POSTURES = ['protect', 'react', 'evidence', 'off'] as const;
export type Posture = (typeof POSTURES)[number];

export const POSTURE_LABEL: Record<Posture, string> = {
  protect: 'Protect ahead',
  react: 'React after',
  evidence: 'On evidence',
  off: 'Not treating',
};

export const POSTURE_HELP: Record<Posture, string> = {
  protect:
    'Spray before a forecast infection event, so the protectant is already on the leaf when it arrives. The most reliable and the most spraying.',
  react:
    'Wait for a confirmed event, then spray inside the window where the material still works after infection has started. Fewer sprays, and only possible with a material that has kickback.',
  evidence:
    'Do nothing until something is actually found — a trap catch, a count while scouting. Right for pests that are absent in most years.',
  off: 'Deliberately not treating this. Recorded as a decision so it is not mistaken for a gap.',
};

/** What a posture requires of a material before it can be honoured. */
export interface MaterialCapability {
  materialKey: string;
  /**
   * Hours after an infection period BEGINS during which the material
   * still works. Null means no post-infection activity at all, which
   * rules the material out of a reactive posture.
   */
  postInfectionHours: number | null;
}

export interface PestPosture {
  pestKey: string;
  posture: Posture;
  /**
   * Minimum severity worth acting on. RIMpro's own guidance is that
   * the threshold should depend on whether the block had the disease
   * last season, which is a judgement this orchard's own observation
   * log can inform.
   */
  minSeverity?: 'minimal' | 'light' | 'moderate' | 'severe';
  /** Stage window the posture applies within, when it is seasonal. */
  fromStage?: PhenologyStage;
  untilStage?: PhenologyStage;
}

export type PostureProblem =
  | { kind: 'no_kickback'; materialKey: string }
  | { kind: 'no_forecast' }
  | { kind: 'no_material' };

/**
 * Can this posture actually be carried out with this material?
 *
 * Returns the reason it cannot, rather than a boolean, so the UI can
 * say what is wrong instead of merely refusing. A posture that cannot
 * be honoured should be visible before the season, not discovered
 * during a wetting event.
 */
export function postureProblem(
  posture: Posture,
  material: MaterialCapability | null,
  options: { hasForecast?: boolean } = {}
): PostureProblem | null {
  if (posture === 'off') return null;
  if (!material) return posture === 'evidence' ? null : { kind: 'no_material' };
  if (posture === 'react' && material.postInfectionHours === null) {
    return { kind: 'no_kickback', materialKey: material.materialKey };
  }
  if (posture === 'protect' && options.hasForecast === false) {
    return { kind: 'no_forecast' };
  }
  return null;
}

export function describeProblem(p: PostureProblem): string {
  switch (p.kind) {
    case 'no_kickback':
      return `${p.materialKey.replace(/_/g, ' ')} has no post-infection activity, so it cannot be used after an event has started. Protect ahead instead, or choose a material with kickback.`;
    case 'no_forecast':
      return 'Protecting ahead needs a weather forecast, and none is available for this orchard.';
    case 'no_material':
      return 'No material is assigned to this step, so there is nothing to time.';
  }
}

/**
 * The deadline for a reactive spray: infection start plus the
 * material's kickback window.
 *
 * Deliberately measured from when the wet period BEGAN rather than when
 * it ended. Infection starts when the spores land on wet tissue, not
 * when the leaves finally dry, and a window counted from the end would
 * quietly grant several extra hours that the material does not have.
 */
export function kickbackDeadline(
  infectionStartTs: string,
  postInfectionHours: number
): string {
  const t = Date.parse(`${infectionStartTs}:00Z`) + postInfectionHours * 3_600_000;
  return new Date(t).toISOString().slice(0, 16).replace('T', 'T');
}

/** Hours left to act, negative once the window has closed. */
export function hoursRemaining(deadlineTs: string, nowTs: string): number {
  return (Date.parse(`${deadlineTs}:00Z`) - Date.parse(`${nowTs}:00Z`)) / 3_600_000;
}
