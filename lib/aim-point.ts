/**
 * Where the crosshair sits when a sheet covers part of the map.
 *
 * Placing a tree on a phone means panning the map under a fixed crosshair,
 * not dragging a dot with a fingertip that hides it. The sheet holding the
 * form covers the lower part of the screen, so the crosshair belongs in the
 * middle of what is still *visible*, not the middle of the map element --
 * otherwise it sits behind the sheet and the person aims at nothing.
 */

/** How much of the height the form sheet takes on a touch screen. */
export const SHEET_FRACTION = 0.5;

export interface AimPixel {
  x: number;
  y: number;
}

/**
 * The centre of the uncovered strip of map, in map-element pixels.
 *
 * `sheetFraction` is clamped: a sheet covering everything would put the
 * crosshair at the very top edge, and a negative one off-screen. Both are
 * bugs elsewhere, but neither should send a tree somewhere absurd.
 */
export function aimPixel(
  width: number,
  height: number,
  sheetFraction = SHEET_FRACTION
): AimPixel {
  const covered = Math.min(Math.max(sheetFraction, 0), 0.9);
  const visibleHeight = height * (1 - covered);
  return { x: width / 2, y: visibleHeight / 2 };
}
