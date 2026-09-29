import { describe, it, expect } from 'vitest';
import { aimPixel, SHEET_FRACTION } from './aim-point';

describe('aimPixel', () => {
  it('centres horizontally', () => {
    expect(aimPixel(400, 800).x).toBe(200);
  });

  it('sits in the middle of the strip the sheet leaves visible', () => {
    // Half the height covered -> visible strip is the top 400px -> its
    // middle is 200px down, NOT the map element's own middle at 400.
    expect(aimPixel(400, 800, 0.5).y).toBe(200);
  });

  it('moves down as the sheet shrinks', () => {
    expect(aimPixel(400, 800, 0.25).y).toBe(300);
    expect(aimPixel(400, 800, 0).y).toBe(400);
  });

  it('defaults to the sheet fraction the layout uses', () => {
    expect(aimPixel(400, 800)).toEqual(aimPixel(400, 800, SHEET_FRACTION));
  });

  it('keeps the crosshair on the map when the sheet claims everything', () => {
    // A full-height sheet would otherwise pin the crosshair to y=0, on the
    // very edge, where there is nothing to aim at.
    const { y } = aimPixel(400, 800, 1);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeCloseTo(40); // clamped to 90% covered
  });

  it('ignores a negative sheet fraction rather than aiming off-screen', () => {
    expect(aimPixel(400, 800, -1).y).toBe(400);
  });
});
