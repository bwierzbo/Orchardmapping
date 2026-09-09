/**
 * Sugar-content unit conversions for fruit checks. Refractometers read
 * °Brix; cidermakers often think in specific gravity. Fruit-check events
 * store °Bx canonically (plus the SG as entered, when SG was used) so
 * multi-year data stays comparable regardless of the display setting.
 */

/** SG → °Brix (standard cubic approximation, ±0.02°Bx over 1.000–1.120). */
export function sgToBrix(sg: number): number {
  if (sg <= 0) return 0;
  const brix = 143.254 * sg ** 3 - 648.670 * sg ** 2 + 1125.805 * sg - 620.389;
  return Math.max(0, brix);
}

/** °Brix → SG (NBS relation; inverse companion to sgToBrix). */
export function brixToSg(brix: number): number {
  if (brix <= 0) return 1.0;
  return 1 + brix / (258.6 - (brix / 258.2) * 227.1);
}
