import { describe, it, expect } from 'vitest';
import {
  clampRect,
  moveRect,
  resizeRect,
  rectsEqual,
  parseStoredRect,
  MIN_WIDTH,
  MIN_HEIGHT,
  type WindowRect,
} from './floating-window';

const VP = { width: 1200, height: 800 };
const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
): WindowRect => ({ x, y, width, height });

describe('clampRect', () => {
  it('leaves a window that already fits alone', () => {
    const r = rect(100, 100, 384, 500);
    expect(clampRect(r, VP)).toEqual(r);
  });

  it('pulls a window back from past the right edge', () => {
    // 1100 + 384 = 1484, which is 284 past the 1200 edge.
    expect(clampRect(rect(1100, 100, 384, 500), VP).x).toBe(1200 - 384);
  });

  it('pulls a window back from past the bottom edge', () => {
    expect(clampRect(rect(100, 700, 384, 500), VP).y).toBe(800 - 500);
  });

  it('pulls a window back from negative coordinates', () => {
    expect(clampRect(rect(-50, -80, 384, 500), VP)).toEqual(
      rect(0, 0, 384, 500),
    );
  });

  it('is the whole point: a window parked off screen comes back', () => {
    // The reported bug -- the panel ends up somewhere the clipped map
    // container hides entirely.
    const lost = rect(4000, 3000, 384, 500);
    const found = clampRect(lost, VP);
    expect(found.x + found.width).toBeLessThanOrEqual(VP.width);
    expect(found.y + found.height).toBeLessThanOrEqual(VP.height);
    expect(found.x).toBeGreaterThanOrEqual(0);
    expect(found.y).toBeGreaterThanOrEqual(0);
  });

  it('raises a window below the minimum size', () => {
    expect(clampRect(rect(0, 0, 10, 10), VP)).toEqual(
      rect(0, 0, MIN_WIDTH, MIN_HEIGHT),
    );
  });

  it('shrinks a window too big for the viewport', () => {
    expect(clampRect(rect(0, 0, 5000, 5000), VP)).toEqual(
      rect(0, 0, 1200, 800),
    );
  });

  it('lets a cramped viewport beat the minimum width', () => {
    // A 200px-wide viewport cannot hold a 288px minimum. Fitting on screen
    // matters more than the minimum, or the panel hangs off the right edge.
    const r = clampRect(rect(0, 0, 384, 500), { width: 200, height: 300 });
    expect(r.width).toBe(200);
    expect(r.x).toBe(0);
  });

  it('survives a zero-sized viewport without producing NaN', () => {
    const r = clampRect(rect(10, 10, 384, 500), { width: 0, height: 0 });
    expect(Object.values(r).every(Number.isFinite)).toBe(true);
    expect(r).toEqual(rect(0, 0, 1, 1));
  });
});

describe('moveRect', () => {
  it('follows the pointer', () => {
    expect(moveRect(rect(100, 100, 384, 500), 40, -30, VP)).toEqual(
      rect(140, 70, 384, 500),
    );
  });

  it('stops at the edge instead of leaving the screen', () => {
    const moved = moveRect(rect(100, 100, 384, 500), -500, 0, VP);
    expect(moved.x).toBe(0);
    expect(moved.width).toBe(384);
  });

  it('keeps the size while sliding along an edge', () => {
    const moved = moveRect(rect(800, 100, 384, 500), 600, 0, VP);
    expect(moved).toEqual(rect(1200 - 384, 100, 384, 500));
  });
});

describe('resizeRect', () => {
  it('widens from the east edge and leaves the west alone', () => {
    expect(resizeRect(rect(100, 100, 384, 500), 'e', 60, 0, VP)).toEqual(
      rect(100, 100, 444, 500),
    );
  });

  it('widens from the west edge by moving it, not the east', () => {
    const r = resizeRect(rect(300, 100, 384, 500), 'w', -60, 0, VP);
    expect(r.x).toBe(240);
    expect(r.width).toBe(444);
    expect(r.x + r.width).toBe(684); // east edge held still
  });

  it('grows from the north edge without moving the bottom', () => {
    const start = rect(100, 300, 384, 500);
    const r = resizeRect(start, 'n', 0, -80, VP);
    expect(r.y).toBe(220);
    expect(r.y + r.height).toBe(800); // bottom held still
  });

  it('drags both axes from a corner', () => {
    expect(resizeRect(rect(100, 100, 384, 500), 'se', 50, 40, VP)).toEqual(
      rect(100, 100, 434, 540),
    );
  });

  it('drags the top-left corner inward', () => {
    const r = resizeRect(rect(100, 100, 384, 500), 'nw', 50, 40, VP);
    expect(r).toEqual(rect(150, 140, 334, 460));
  });

  it('stops the dragged edge at the minimum width and holds the far edge', () => {
    const start = rect(100, 100, 384, 500);
    const r = resizeRect(start, 'w', 1000, 0, VP);
    expect(r.width).toBe(MIN_WIDTH);
    expect(r.x + r.width).toBe(484); // east edge never moved
    expect(r.x).toBe(484 - MIN_WIDTH);
  });

  it('stops the east edge at the minimum width without moving the west', () => {
    const r = resizeRect(rect(100, 100, 384, 500), 'e', -1000, 0, VP);
    expect(r).toEqual(rect(100, 100, MIN_WIDTH, 500));
  });

  it('stops the north edge at the minimum height and holds the bottom', () => {
    const r = resizeRect(rect(100, 100, 384, 500), 'n', 0, 1000, VP);
    expect(r.height).toBe(MIN_HEIGHT);
    expect(r.y + r.height).toBe(600); // bottom held still
  });

  it('will not pull an edge out past the viewport', () => {
    const r = resizeRect(rect(900, 600, 384, 180), 'se', 500, 500, VP);
    expect(r.x + r.width).toBe(VP.width);
    expect(r.y + r.height).toBe(VP.height);
  });

  it('will not pull the west edge out past zero', () => {
    const r = resizeRect(rect(100, 100, 384, 500), 'w', -400, 0, VP);
    expect(r.x).toBe(0);
    expect(r.x + r.width).toBe(484); // east edge still held
  });

  it('gives up the far edge rather than overflow a cramped viewport', () => {
    // Pulling east in a 200px viewport: the minimum cannot be met inside the
    // screen, so the window ends up the viewport's width, fully visible.
    const r = resizeRect(rect(0, 0, 150, 250), 'e', 500, 0, {
      width: 200,
      height: 300,
    });
    expect(r.width).toBe(200);
    expect(r.x).toBe(0);
  });

  it('never returns a rect clampRect would want to change', () => {
    const handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
    for (const h of handles) {
      for (const d of [-900, -40, 0, 40, 900]) {
        const r = resizeRect(rect(400, 300, 384, 500), h, d, d, VP);
        expect(rectsEqual(clampRect(r, VP), r)).toBe(true);
      }
    }
  });
});

describe('rectsEqual', () => {
  it('matches identical boxes', () => {
    expect(rectsEqual(rect(1, 2, 3, 4), rect(1, 2, 3, 4))).toBe(true);
  });

  it('notices a single changed field', () => {
    expect(rectsEqual(rect(1, 2, 3, 4), rect(1, 2, 3, 5))).toBe(false);
    expect(rectsEqual(rect(1, 2, 3, 4), rect(0, 2, 3, 4))).toBe(false);
  });
});

describe('parseStoredRect', () => {
  it('round-trips what the component writes', () => {
    const r = rect(120, 90, 420, 560);
    expect(parseStoredRect(JSON.stringify(r))).toEqual(r);
  });

  it('returns null for an empty slot', () => {
    expect(parseStoredRect(null)).toBeNull();
    expect(parseStoredRect('')).toBeNull();
  });

  it('returns null for junk rather than throwing', () => {
    expect(parseStoredRect('{oh no')).toBeNull();
    expect(parseStoredRect('42')).toBeNull();
    expect(parseStoredRect('null')).toBeNull();
    expect(parseStoredRect('"a string"')).toBeNull();
  });

  it('rejects a partial object', () => {
    expect(parseStoredRect('{"x":1,"y":2}')).toBeNull();
  });

  it('rejects non-numeric and non-finite fields', () => {
    expect(parseStoredRect('{"x":"1","y":2,"width":3,"height":4}')).toBeNull();
    // JSON has no Infinity or NaN literal; both arrive as null.
    expect(parseStoredRect('{"x":null,"y":2,"width":3,"height":4}')).toBeNull();
  });

  it('rejects a collapsed box', () => {
    expect(parseStoredRect('{"x":1,"y":2,"width":0,"height":4}')).toBeNull();
    expect(parseStoredRect('{"x":1,"y":2,"width":3,"height":-4}')).toBeNull();
  });

  it('accepts an off-screen stored rect, leaving it for clampRect to rescue', () => {
    // Parsing validates shape, not placement; a stale position from a bigger
    // monitor is still a position, and the caller clamps it on mount.
    expect(
      parseStoredRect('{"x":9000,"y":9000,"width":384,"height":500}'),
    ).toEqual(rect(9000, 9000, 384, 500));
  });
});
