/**
 * Keeping the tree you just tapped out from under the panel about it.
 *
 * The detail panel is fixed: a column down the right on a wide screen, a
 * sheet across the bottom on a narrow one. Selecting a tree only
 * highlighted it, so a tree on the right-hand edge -- or anywhere in the
 * lower two thirds of a phone -- ended up behind the very panel describing
 * it, with no way to move either.
 *
 * Moving the map is the fix rather than moving the panel: the panel is
 * where the eye already is, and a window that has to be dragged out of the
 * way is a window in the way. The map pans only when the point is actually
 * covered, so a tree already in clear space does not lurch.
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The panel, as it is actually laid out in TreeDetailPanel. */
export const PANEL = {
  /** md:w-96 plus md:right-4. */
  desktopWidth: 384 + 16,
  /** md:top-20 — the panel starts below the toolbar. */
  desktopTop: 80,
  /** max-h-[70vh] on a narrow screen. */
  mobileHeightFraction: 0.7,
  /** Tailwind's md breakpoint, which is what switches the layout. */
  breakpointPx: 768,
} as const;

/** How far inside the clear area to bring the point, so it is not on the seam. */
export const REVEAL_MARGIN = 48;

/** The part of the map still visible beside or above the panel. */
export function clearArea(width: number, height: number): Rect {
  const wide = width >= PANEL.breakpointPx;
  if (wide) {
    return { left: 0, top: 0, right: Math.max(0, width - PANEL.desktopWidth), bottom: height };
  }
  return { left: 0, top: 0, right: width, bottom: height * (1 - PANEL.mobileHeightFraction) };
}

/**
 * How far to pan the map, in pixels, so `point` sits inside `area`.
 *
 * Returns null when it already does — panning then would move the map for
 * no reason, which reads as the app fighting you.
 *
 * The sign is MapLibre's `panBy`: a positive x moves the camera east, so
 * the point moves left on screen and out from under a right-hand panel.
 */
export function panToReveal(
  point: Point,
  area: Rect,
  margin = REVEAL_MARGIN
): { dx: number; dy: number } | null {
  // A margin wider than the area itself would push the point back out the
  // far side; half the area is the most that can be asked for.
  const mx = Math.min(margin, Math.max(0, (area.right - area.left) / 2));
  const my = Math.min(margin, Math.max(0, (area.bottom - area.top) / 2));

  let dx = 0;
  let dy = 0;
  if (point.x > area.right - mx) dx = point.x - (area.right - mx);
  else if (point.x < area.left + mx) dx = point.x - (area.left + mx);
  if (point.y > area.bottom - my) dy = point.y - (area.bottom - my);
  else if (point.y < area.top + my) dy = point.y - (area.top + my);

  if (dx === 0 && dy === 0) return null;
  return { dx, dy };
}
