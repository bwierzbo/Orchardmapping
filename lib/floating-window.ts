/**
 * Geometry for a panel the user can drag by its header and resize by an edge,
 * the way a window behaves on a desktop.
 *
 * The rules live here, apart from the React that applies them, for the reason
 * every other lib module in this directory does: they are arithmetic, and
 * arithmetic is worth testing. The one rule that matters more than the rest is
 * that a window never ends up somewhere the user cannot reach it -- the map
 * container clips its children, so a panel nudged past the edge is not merely
 * awkward, it is gone. Every operation below routes through `clampRect`.
 */

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/**
 * Small enough to tuck a tall panel into a corner, wide enough that the
 * address line and the two-column fields inside do not wrap into nonsense.
 */
export const MIN_WIDTH = 288;
export const MIN_HEIGHT = 200;

/** Which edge or corner is being pulled. Compound keys mean a corner. */
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * Pull a rect fully inside the viewport, shrinking it only if it cannot fit.
 *
 * Size is settled before position, because the bound on x depends on the
 * width that survives. A viewport narrower than MIN_WIDTH wins over the
 * minimum: a window too wide to fit would otherwise be pushed off the right
 * edge to satisfy a minimum nobody can see.
 */
export function clampRect(rect: WindowRect, viewport: Viewport): WindowRect {
  const maxWidth = Math.max(viewport.width, 1);
  const maxHeight = Math.max(viewport.height, 1);
  const width = Math.min(Math.max(rect.width, MIN_WIDTH), maxWidth);
  const height = Math.min(Math.max(rect.height, MIN_HEIGHT), maxHeight);
  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, 0), Math.max(viewport.width - width, 0)),
    y: Math.min(Math.max(rect.y, 0), Math.max(viewport.height - height, 0)),
  };
}

/** Drag the whole window by a pointer delta, kept on screen. */
export function moveRect(
  rect: WindowRect,
  dx: number,
  dy: number,
  viewport: Viewport,
): WindowRect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, viewport);
}

/**
 * Pull one edge or corner by a pointer delta.
 *
 * Worked through edges rather than width and height, because that is what a
 * resize actually is: the opposite edge must not budge while this one moves.
 * When a drag would take the window under its minimum the dragged edge stops
 * and the far edge still holds still, which is what makes the gesture feel
 * like a window rather than a rubber band.
 */
export function resizeRect(
  rect: WindowRect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  viewport: Viewport,
): WindowRect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;

  if (handle.includes('w')) left += dx;
  if (handle.includes('e')) right += dx;
  if (handle.includes('n')) top += dy;
  if (handle.includes('s')) bottom += dy;

  // Honour the minimum by backing off the edge that moved, never the other.
  if (handle.includes('w') && right - left < MIN_WIDTH)
    left = right - MIN_WIDTH;
  if (handle.includes('e') && right - left < MIN_WIDTH)
    right = left + MIN_WIDTH;
  if (handle.includes('n') && bottom - top < MIN_HEIGHT)
    top = bottom - MIN_HEIGHT;
  if (handle.includes('s') && bottom - top < MIN_HEIGHT)
    bottom = top + MIN_HEIGHT;

  // Then the viewport. Clamping an edge here can re-break the minimum, so the
  // far edge gives way second -- being reachable outranks being a given size.
  left = Math.max(left, 0);
  top = Math.max(top, 0);
  right = Math.min(right, viewport.width);
  bottom = Math.min(bottom, viewport.height);
  if (right - left < MIN_WIDTH) left = Math.max(right - MIN_WIDTH, 0);
  if (bottom - top < MIN_HEIGHT) top = Math.max(bottom - MIN_HEIGHT, 0);

  return clampRect(
    { x: left, y: top, width: right - left, height: bottom - top },
    viewport,
  );
}

/** Whether two rects describe the same box, to skip pointless re-renders. */
export function rectsEqual(a: WindowRect, b: WindowRect): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

/**
 * Read a rect back out of localStorage.
 *
 * Anything unexpected returns null, which the caller reads as "no stored
 * position" and falls back to the docked default. A half-written or
 * hand-edited entry should cost the user their saved position, not the panel.
 */
export function parseStoredRect(raw: string | null): WindowRect | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { x, y, width, height } = parsed as Record<string, unknown>;
  const values = [x, y, width, height];
  if (!values.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return null;
  }
  if ((width as number) <= 0 || (height as number) <= 0) return null;
  return {
    x: x as number,
    y: y as number,
    width: width as number,
    height: height as number,
  };
}
