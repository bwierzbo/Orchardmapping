/**
 * The Long Ashton cider classification.
 *
 * Barker, Long Ashton Research Station, 1903. Two axes, both measured:
 * tannin above or below 0.2%, malic acid above or below 0.45%. So a
 * variety's class is computed from its juice, not asserted about it —
 * which is what makes "known as a bittersharp, presents here as a sharp"
 * a statement with evidence behind it rather than an opinion.
 */

export const CIDER_CLASSES = ['SW', 'SH', 'BSW', 'BSH'] as const;
export type CiderClass = (typeof CIDER_CLASSES)[number];

export const CLASS_LABEL: Record<CiderClass, string> = {
  SW: 'sweet',
  SH: 'sharp',
  BSW: 'bittersweet',
  BSH: 'bittersharp',
};

/** Long Ashton thresholds, in percent of juice. */
export const TANNIN_THRESHOLD_PCT = 0.2;
export const ACID_THRESHOLD_PCT = 0.45;

/**
 * How close to a threshold still counts as "on the line".
 *
 * A variety measuring 0.19% tannin is not meaningfully different from one
 * at 0.21%, and calling that a reclassification would cry wolf every
 * other season. Within this band the axis is reported as borderline
 * rather than decided.
 */
export const BORDERLINE_MARGIN = 0.02;

export interface Composition {
  tanninPct?: number | null;
  acidPct?: number | null;
}

export interface Classification {
  /** Null when either axis is missing — half a measurement is not a class. */
  ciderClass: CiderClass | null;
  /** True when a value sits within the margin of its threshold. */
  tanninBorderline: boolean;
  acidBorderline: boolean;
  /** Why this came out as it did, for showing beside the answer. */
  reason: string;
}

/**
 * Classify juice. Both axes are required: knowing only the acid tells you
 * sharp-or-sweet versus bitter-or-not, never which of the four.
 */
export function classify(c: Composition): Classification {
  const { tanninPct, acidPct } = c;
  if (tanninPct == null || acidPct == null) {
    return {
      ciderClass: null,
      tanninBorderline: false,
      acidBorderline: false,
      reason:
        tanninPct == null && acidPct == null
          ? 'No tannin or acid measured.'
          : tanninPct == null
            ? 'Acid measured but not tannin — the bitter axis is unknown.'
            : 'Tannin measured but not acid — the sharp axis is unknown.',
    };
  }

  const bitter = tanninPct > TANNIN_THRESHOLD_PCT;
  const sharp = acidPct > ACID_THRESHOLD_PCT;
  const tanninBorderline = Math.abs(tanninPct - TANNIN_THRESHOLD_PCT) <= BORDERLINE_MARGIN;
  const acidBorderline = Math.abs(acidPct - ACID_THRESHOLD_PCT) <= BORDERLINE_MARGIN;

  const ciderClass: CiderClass = bitter ? (sharp ? 'BSH' : 'BSW') : sharp ? 'SH' : 'SW';

  const parts = [
    `tannin ${tanninPct}% (${bitter ? 'over' : 'under'} ${TANNIN_THRESHOLD_PCT}%)`,
    `acid ${acidPct}% (${sharp ? 'over' : 'under'} ${ACID_THRESHOLD_PCT}%)`,
  ];
  const caveat =
    tanninBorderline || acidBorderline
      ? ` — ${[tanninBorderline ? 'tannin' : null, acidBorderline ? 'acid' : null]
          .filter(Boolean)
          .join(' and ')} sits on the line, so treat this as indicative`
      : '';

  return {
    ciderClass,
    tanninBorderline,
    acidBorderline,
    reason: `${parts.join(', ')}${caveat}`,
  };
}

/**
 * How to say it when the measured class differs from the canonical one.
 * Returns null when they agree, or when there is nothing to compare.
 */
export function describeDivergence(
  canonical: CiderClass | null,
  observed: Classification,
  scopeLabel: string
): string | null {
  if (!canonical || !observed.ciderClass || canonical === observed.ciderClass) return null;
  const hedge = observed.tanninBorderline || observed.acidBorderline ? 'reads closer to' : 'presents as';
  return `Known as a ${CLASS_LABEL[canonical]}, but ${hedge} a ${CLASS_LABEL[observed.ciderClass]} ${scopeLabel}.`;
}
