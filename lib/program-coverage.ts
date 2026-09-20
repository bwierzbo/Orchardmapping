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
  /** The orchard's own decisions. A pest with any posture recorded has
   *  been thought about; one with none has not. */
  decisions?: readonly PestDecision[];
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
 * A recorded decision not to treat something.
 *
 * This used to be a constant in this file, which meant changing your
 * mind about a pest required a developer — and it duplicated a
 * mechanism that already existed. A posture of 'off' in
 * orchard_pest_posture IS this, per orchard, with the reason attached.
 *
 * The three states matter and were previously tangled:
 *   a posture set to anything   the orchard is managing it
 *   a posture set to 'off'      decided against, with a reason
 *   no posture at all           UNDECIDED — which is the only one
 *                               this check should be flagging
 */
export interface PestDecision {
  pestKey: string;
  /** 'off' is a decision not to treat; anything else is management. */
  posture: string;
  note?: string | null;
}

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

  // Any recorded posture means the pest has been considered, whether
  // the answer was to treat it or deliberately not to.
  const decided = new Set((input.decisions ?? []).map((d) => d.pestKey));

  const gaps: CoverageGap[] = [];
  for (const pest of input.pests) {
    if (pest.category === 'beneficial') continue;
    if (!DEMANDS_COVERAGE.has(pest.prevalence)) continue;
    if (covered.has(pest.key)) continue;
    if (decided.has(pest.key)) continue;

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
