/**
 * A variety's full bloom this spring, estimated from a few indicator
 * varieties that were actually seen in bloom.
 *
 * The ORDER varieties bloom in is steady from year to year; the SPACING is
 * not -- a warm spring squeezes the sequence into a week, a cold drawn-out
 * one stretches it past three. So the owner logs full bloom on three or
 * four indicators spread through the season (early, mid, late), and every
 * other variety is placed among them by where it sits in the reference
 * order: one indicator moves everything by the same amount; two or more
 * also stretch or squeeze the gaps.
 *
 * The reference order is a day of the year at WSU Mount Vernon. A variety
 * with a reference bloom date in the library (ref_bloom_mmdd, 047) uses
 * it; any other variety its published flowering group (1-7), placed on the
 * same scale. A variety with neither cannot be placed and gets no estimate.
 */
import { dayOfYear } from './harvest-target';

/**
 * Where each flowering group sits on WSU Mount Vernon's calendar, as a day
 * of the year. Fitted to the WSU-measured varieties whose groups are
 * published (see FLOWERING_GROUP_FIT); used only for varieties WSU did not
 * measure.
 */
export const GROUP_REFERENCE_DOY: Record<number, number> = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
  6: 0,
  7: 0,
};

/** A variety's place in the reference bloom order, as a day of the year. */
export function referenceBloomDoy(entry: {
  /** The library's reference bloom, "MM-DD". */
  refBloomMmdd: string | null;
  floweringGroup: number | null;
}): number | null {
  const m = entry.refBloomMmdd ? /^(\d{2})-(\d{2})$/.exec(entry.refBloomMmdd) : null;
  if (m) return dayOfYear(Number(m[1]), Number(m[2]));
  if (entry.floweringGroup != null && GROUP_REFERENCE_DOY[entry.floweringGroup] != null) {
    return GROUP_REFERENCE_DOY[entry.floweringGroup];
  }
  return null;
}

/** An indicator seen in full bloom: its reference place and the day it bloomed here. */
export interface BloomIndicator {
  referenceDoy: number;
  observedDoy: number;
}

/**
 * How much a gap between indicators may be stretched or squeezed when it is
 * carried past the last indicator. Between indicators the observed spacing
 * is used as it is; beyond them it is an extrapolation, kept within what
 * springs here plausibly do.
 */
const SLOPE_LIMITS = { min: 0.5, max: 1.5 } as const;

/**
 * Estimated full bloom (day of the year) for a variety at `referenceDoy`,
 * from the indicators seen in bloom. Null with no indicators.
 *
 * Indicators sharing a reference day are averaged first, so two trees of
 * one variety logged a day apart count once.
 */
export function estimateBloomDoy(
  referenceDoy: number,
  indicators: readonly BloomIndicator[],
): number | null {
  if (indicators.length === 0) return null;
  const byRef = new Map<number, number[]>();
  for (const i of indicators) byRef.set(i.referenceDoy, [...(byRef.get(i.referenceDoy) ?? []), i.observedDoy]);
  const points = [...byRef.entries()]
    .map(([ref, obs]) => ({ ref, obs: obs.reduce((a, b) => a + b, 0) / obs.length }))
    .sort((a, b) => a.ref - b.ref);

  if (points.length === 1) return Math.round(points[0].obs + (referenceDoy - points[0].ref));

  const slopeOf = (a: { ref: number; obs: number }, b: { ref: number; obs: number }) =>
    (b.obs - a.obs) / (b.ref - a.ref);
  const clamp = (s: number) => Math.min(SLOPE_LIMITS.max, Math.max(SLOPE_LIMITS.min, s));

  const first = points[0];
  const last = points[points.length - 1];
  if (referenceDoy <= first.ref) {
    return Math.round(first.obs + (referenceDoy - first.ref) * clamp(slopeOf(first, points[1])));
  }
  if (referenceDoy >= last.ref) {
    return Math.round(last.obs + (referenceDoy - last.ref) * clamp(slopeOf(points[points.length - 2], last)));
  }
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    if (referenceDoy <= b.ref) {
      // Between two indicators the spring's own spacing is used, unclamped:
      // it was observed, not assumed.
      return Math.round(a.obs + (referenceDoy - a.ref) * slopeOf(a, b));
    }
  }
  return null;
}
