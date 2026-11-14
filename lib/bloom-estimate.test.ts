import { describe, expect, it } from 'vitest';
import { estimateBloomDoy, GROUP_REFERENCE_DOY, referenceBloomDoy } from './bloom-estimate';
import { dayOfYear } from './harvest-target';

// WSU Mount Vernon reference blooms, as day of year.
const HEWES = dayOfYear(4, 19); // Virginia Hewes Crab, the earliest
const KINGSTON = dayOfYear(5, 12); // Kingston Black
const BROWN_SNOUT = dayOfYear(5, 22); // Brown Snout, the latest
const HARRISON = dayOfYear(5, 16);

describe('referenceBloomDoy', () => {
  it("uses the library's reference bloom date when there is one", () => {
    expect(referenceBloomDoy({ refBloomMmdd: '05-12', floweringGroup: 3 })).toBe(KINGSTON);
  });

  it('places a variety WSU did not measure by its flowering group', () => {
    expect(referenceBloomDoy({ refBloomMmdd: null, floweringGroup: 4 })).toBe(GROUP_REFERENCE_DOY[4]);
  });

  it('cannot place a variety with neither', () => {
    expect(referenceBloomDoy({ refBloomMmdd: null, floweringGroup: null })).toBeNull();
  });
});

describe('estimateBloomDoy', () => {
  it('has nothing to go on with no indicators', () => {
    expect(estimateBloomDoy(HARRISON, [])).toBeNull();
  });

  it('moves every variety by the same amount from a single indicator', () => {
    // Kingston Black bloomed 10 days later here than at Mount Vernon.
    const est = estimateBloomDoy(HARRISON, [{ referenceDoy: KINGSTON, observedDoy: KINGSTON + 10 }]);
    console.log('Harrison from Kingston Black alone:', est, 'reference', HARRISON);
    expect(est).toBe(HARRISON + 10);
  });

  it("uses the spring's own spacing between two indicators", () => {
    // A warm spring: Hewes 10 days late, Brown Snout only 2 -- the sequence
    // squeezed from 33 days to 25. Kingston Black sits 23/33 of the way.
    const indicators = [
      { referenceDoy: HEWES, observedDoy: HEWES + 10 },
      { referenceDoy: BROWN_SNOUT, observedDoy: BROWN_SNOUT + 2 },
    ];
    const est = estimateBloomDoy(KINGSTON, indicators)!;
    const expected = HEWES + 10 + (KINGSTON - HEWES) * (25 / 33);
    console.log('Kingston Black between Hewes and Brown Snout:', est, 'expected ≈', expected);
    expect(est).toBe(Math.round(expected));
  });

  it('carries the nearest spacing past the last indicator, within plausible limits', () => {
    // Two indicators a day apart in reference, observed 10 days apart: a
    // stretch of 10x, which beyond them is held to 1.5x.
    const indicators = [
      { referenceDoy: KINGSTON, observedDoy: KINGSTON },
      { referenceDoy: KINGSTON + 1, observedDoy: KINGSTON + 10 },
    ];
    const est = estimateBloomDoy(BROWN_SNOUT, indicators)!;
    expect(est).toBe(Math.round(KINGSTON + 10 + (BROWN_SNOUT - KINGSTON - 1) * 1.5));
  });

  it('counts two logs of one indicator variety once, averaged', () => {
    const est = estimateBloomDoy(HARRISON, [
      { referenceDoy: KINGSTON, observedDoy: KINGSTON + 9 },
      { referenceDoy: KINGSTON, observedDoy: KINGSTON + 11 },
    ]);
    expect(est).toBe(HARRISON + 10);
  });
});
