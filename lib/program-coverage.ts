/**
 * Does the program actually address what the library says is here?
 *
 * This exists because it didn't, and nothing noticed. The pest library
 * rated leafrollers 'high' from the day it was seeded, Bt kurstaki
 * listed them as a target from before that, and the program still had
 * no step against them — because the steps were transcribed from a
 * prose plan instead of checked against the library. A count of
 * catalogued pests tells you nothing; a join does.
 *
 * Pure, so the rule is testable without a database.
 * scripts/check-program-coverage.ts runs it against the real one.
 */

export interface CoverageInputs {
  pests: readonly { key: string; name: string; category: string; prevalence: string }[];
  /** Steps that are ACTIVE — a step switched off is not coverage. */
  steps: readonly { key: string; pestKey: string | null; materialKey: string | null }[];
  /** Materials, so "nothing treats it" is distinguishable from
   *  "something treats it and nobody scheduled that". */
  materials: readonly { material_key: string | null; targets: readonly string[] }[];
}

export interface CoverageGap {
  pestKey: string;
  name: string;
  prevalence: string;
  /** Material keys that list this pest but are used by no step. */
  availableMaterials: string[];
  /** Worse: something in the cupboard treats it and nothing schedules it. */
  hasUnusedMaterial: boolean;
}

/**
 * Pests the program deliberately leaves alone, each with the reason.
 * Being on this list is a decision; being absent from it and uncovered
 * is an oversight. That is the whole distinction this module draws.
 */
export const DELIBERATELY_UNTREATED: Record<string, string> = {
  fire_blight: 'Absent west of the Cascades — catalogued so it can be planned around, not for.',
  sooty_blotch_flyspeck: 'Purely cosmetic and irrelevant to fermented product.',
  european_earwig: 'Beneficial — a woolly apple aphid predator worth protecting.',
  mites: 'Self-inflicted: flare-ups follow broad-spectrum sprays. Restraint is the control.',
  bulls_eye_rot: 'The storage phase of anthracnose — the autumn copper and excision program is the control.',
  blue_mold: 'Handled at the press as fruit hygiene, not in the orchard.',
  tent_caterpillar: 'Episodic. Bt is held in reserve for an outbreak year rather than scheduled.',
  rosy_apple_aphid:
    'Owner, Sept 2026: not a problem in this block. Oil and soap both list it, so a step can be added the season it becomes one — but the control window shuts soon after petal fall, so that decision has to be made before bud break, not during.',
};

/** Prevalence levels that demand a step or a documented exemption. */
const DEMANDS_COVERAGE = new Set(['high', 'moderate']);

/**
 * Every pest that the library says matters here, has no active step,
 * and no written reason to be left alone. Worst first: a gap with an
 * unused material sitting in the cupboard ranks above one with nothing
 * available, because it is a scheduling miss rather than a real
 * limitation.
 */
export function findCoverageGaps(input: CoverageInputs): CoverageGap[] {
  const covered = new Set(
    input.steps.map((s) => s.pestKey).filter((k): k is string => k !== null)
  );
  const scheduledMaterials = new Set(
    input.steps.map((s) => s.materialKey).filter((k): k is string => k !== null)
  );

  const gaps: CoverageGap[] = [];
  for (const pest of input.pests) {
    if (pest.category === 'beneficial') continue;
    if (!DEMANDS_COVERAGE.has(pest.prevalence)) continue;
    if (covered.has(pest.key)) continue;
    if (pest.key in DELIBERATELY_UNTREATED) continue;

    const available = input.materials
      .filter((m) => m.material_key && m.targets.includes(pest.key))
      .map((m) => m.material_key!);
    gaps.push({
      pestKey: pest.key,
      name: pest.name,
      prevalence: pest.prevalence,
      availableMaterials: available,
      hasUnusedMaterial: available.some((k) => !scheduledMaterials.has(k)),
    });
  }

  const rank = (g: CoverageGap) =>
    (g.prevalence === 'high' ? 0 : 2) + (g.hasUnusedMaterial ? 0 : 1);
  return gaps.sort((a, b) => rank(a) - rank(b) || a.pestKey.localeCompare(b.pestKey));
}
