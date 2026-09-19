/**
 * Spray-program rules: what an orchard may apply, and what it should be
 * warned about before it does.
 *
 * Everything here is advisory *except* certified-organic blocking. The
 * pesticide label is the legal document — this module encodes agronomic
 * interval rules and program scope, never label rates.
 */

export const PROGRAM_MODES = [
  'organic_practices',
  'certified_organic',
  'unrestricted',
] as const;
export type ProgramMode = (typeof PROGRAM_MODES)[number];

export const PROGRAM_MODE_LABEL: Record<ProgramMode, string> = {
  organic_practices: 'Organic practices',
  certified_organic: 'Certified organic',
  unrestricted: 'No restrictions',
};

export const PROGRAM_MODE_HELP: Record<ProgramMode, string> = {
  organic_practices:
    'Prefers OMRI-listed materials and warns about anything else, but never blocks — you decide.',
  certified_organic:
    'Blocks materials that are not OMRI-listed, and keeps records in the form a certifier asks for.',
  unrestricted:
    'Every material is available. Conventional options are flagged where they genuinely outperform the organic one.',
};

export interface SprayMaterial {
  id: number;
  material_key: string | null;
  name: string;
  material_type: string;
  active_ingredient: string | null;
  omri_listed: boolean;
  restricted_use: boolean;
  rei_hours: number | null;
  phi_days: number | null;
  rate_low: number | null;
  rate_high: number | null;
  rate_unit: string | null;
  targets: string[];
  /** Must not be applied within conflict_days of these, in EITHER order. */
  conflicts_with: string[];
  conflict_days: number | null;
  /**
   * Must not be applied AFTER these, within conflict_after_days —
   * one-way, unlike conflicts_with. Oil onto foliage already carrying
   * lime sulfur is the case this exists for: mixing the two is a
   * registered bloom thinner, but following one with the other is not
   * the same operation.
   */
  conflicts_after: string[];
  conflict_after_days: number | null;
  max_per_season: number | null;
  notes: string | null;
}

export interface PriorApplication {
  material_key: string | null;
  material_name: string;
  applied_at: string; // ISO instant — interval rules count from this
  /**
   * The same moment as an orchard-local calendar day (YYYY-MM-DD).
   * Slicing applied_at would day-shift an evening application, since
   * that string is UTC — see lib/dates.ts.
   */
  applied_on: string;
}

export type FindingLevel = 'blocked' | 'warning' | 'info';

export interface Finding {
  level: FindingLevel;
  message: string;
}

const DAY_MS = 86_400_000;

/** Growing season for per-season caps: a calendar year here (dormant
 *  copper in November belongs to that winter's program, so seasons are
 *  keyed on the year the application falls in). */
function seasonOf(date: Date): number {
  return date.getFullYear();
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / DAY_MS;
}

/**
 * Evaluate a proposed application against program mode and history.
 * Returns every finding; the caller decides how loudly to present them.
 * A `blocked` finding means the app should refuse to record it.
 */
export function evaluateApplication(args: {
  material: SprayMaterial;
  appliedAt: Date;
  mode: ProgramMode;
  history: PriorApplication[];
  /** Full library, so a conflicting material can be named in the message. */
  library?: SprayMaterial[];
}): Finding[] {
  const { material, appliedAt, mode, history, library = [] } = args;
  const findings: Finding[] = [];
  // ---- program scope ----
  if (!material.omri_listed) {
    if (mode === 'certified_organic') {
      findings.push({
        level: 'blocked',
        message: `${material.name} is not OMRI-listed, and this orchard is set to certified organic. Applying it would break certification.`,
      });
    } else if (mode === 'organic_practices') {
      findings.push({
        level: 'warning',
        message: `${material.name} is not OMRI-listed. Fine under "organic practices", but it would disqualify a certified block.`,
      });
    }
  }
  if (material.restricted_use) {
    findings.push({
      level: 'warning',
      message: `${material.name} is a restricted-use pesticide — a licensed applicator and the corresponding records are required.`,
    });
  }

  // ---- interval conflicts (sulfur ↔ oil, both directions) ----
  const conflictDays = material.conflict_days ?? 0;
  if (material.conflicts_with.length > 0 && conflictDays > 0) {
    for (const prior of history) {
      if (!prior.material_key) continue;
      if (!material.conflicts_with.includes(prior.material_key)) continue;
      const gap = daysBetween(appliedAt, new Date(prior.applied_at));
      if (gap < conflictDays) {
        findings.push({
          level: 'warning',
          message: `${material.name} within ${gap.toFixed(0)} days of ${prior.material_name} — these need ${conflictDays} days between them in either order (phytotoxicity risk).`,
        });
      }
    }
  }
  // The other direction: a prior application whose OWN rule names this one
  for (const prior of history) {
    if (!prior.material_key || !material.material_key) continue;
    const priorMaterial = library.find((m) => m.material_key === prior.material_key);
    if (!priorMaterial?.conflicts_with.includes(material.material_key)) continue;
    // When both rows name each other — as sulfur and oil do — the loop
    // above has already said it. One fact, one warning.
    if (material.conflicts_with.includes(prior.material_key)) continue;
    const days = priorMaterial.conflict_days ?? 0;
    if (days <= 0) continue;
    const gap = daysBetween(appliedAt, new Date(prior.applied_at));
    if (gap < days) {
      findings.push({
        level: 'warning',
        message: `${prior.material_name} was applied ${gap.toFixed(0)} days ago and needs ${days} days before ${material.name}.`,
      });
    }
  }

  // ---- directional conflicts (this material AFTER another) ----
  //
  // WSU's Fruit and Leaf Injury guide says only "do not apply oil to
  // foliage treated with lime-sulfur" and attaches no interval, so the
  // number here is this app's conservative default. The message says so
  // rather than implying a citation it does not have.
  const afterDays = material.conflict_after_days ?? 0;
  if (material.conflicts_after.length > 0 && afterDays > 0) {
    for (const prior of history) {
      if (!prior.material_key) continue;
      if (!material.conflicts_after.includes(prior.material_key)) continue;
      // Signed, unlike daysBetween: the whole point is which came first.
      const elapsedMs = appliedAt.getTime() - new Date(prior.applied_at).getTime();
      // Under a day apart is a TANK MIX, which for lime sulfur and oil
      // is a registered operation rather than a hazard. Nothing in the
      // record distinguishes one pass from two on the same day, and
      // warning on the endorsed operation is the error being fixed here.
      if (elapsedMs < DAY_MS) continue;
      const gap = elapsedMs / DAY_MS;
      if (gap >= afterDays) continue;
      findings.push({
        level: 'warning',
        message: `${prior.material_name} went on ${gap.toFixed(0)} day${gap.toFixed(0) === '1' ? '' : 's'} ago — do not apply ${material.name} to foliage still carrying it. No interval is published for this pair; ${afterDays} days is a conservative default, so check your ${material.name.toLowerCase()} label.`,
      });
    }
  }

  // ---- per-season caps ----
  if (material.max_per_season && material.material_key) {
    const season = seasonOf(appliedAt);
    const used = history.filter(
      (p) =>
        p.material_key === material.material_key &&
        seasonOf(new Date(p.applied_at)) === season,
    ).length;
    if (used >= material.max_per_season) {
      findings.push({
        level: 'warning',
        message: `${material.name} is limited to ${material.max_per_season} application${material.max_per_season === 1 ? '' : 's'} per season and has already been applied ${used} time${used === 1 ? '' : 's'} in ${season}.`,
      });
    }
  }

  // ---- re-entry / pre-harvest, surfaced at the moment of decision ----
  if (material.rei_hours) {
    findings.push({
      level: 'info',
      message: `Re-entry interval ${material.rei_hours} h — keep people out of the block until ${new Date(
        appliedAt.getTime() + material.rei_hours * 3_600_000,
      ).toLocaleString()}.`,
    });
  }
  if (material.phi_days) {
    findings.push({
      level: 'info',
      message: `Pre-harvest interval ${material.phi_days} days — do not pick before ${new Date(
        appliedAt.getTime() + material.phi_days * DAY_MS,
      ).toLocaleDateString()}.`,
    });
  }

  return findings;
}

/** Materials this orchard may choose from, given its program mode. */
export function availableMaterials(
  library: SprayMaterial[],
  mode: ProgramMode,
): SprayMaterial[] {
  if (mode === 'certified_organic') return library.filter((m) => m.omri_listed);
  return library;
}

/**
 * What to reach for against a given target, best-fit first: OMRI options
 * lead in the organic modes, and within a mode the more specific material
 * (fewer targets) outranks a broad one — a targeted material is easier on
 * the beneficials this program depends on.
 */
export function recommendFor(
  library: SprayMaterial[],
  target: string,
  mode: ProgramMode,
): SprayMaterial[] {
  const organicFirst = mode !== 'unrestricted';
  return availableMaterials(library, mode)
    .filter((m) => m.targets.includes(target))
    .sort((a, b) => {
      if (organicFirst && a.omri_listed !== b.omri_listed) {
        return a.omri_listed ? -1 : 1;
      }
      if (a.restricted_use !== b.restricted_use) return a.restricted_use ? 1 : -1;
      return a.targets.length - b.targets.length;
    });
}

export function hasBlocker(findings: Finding[]): boolean {
  return findings.some((f) => f.level === 'blocked');
}
