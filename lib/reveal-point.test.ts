import { describe, it, expect } from 'vitest';
import { clearArea, panToReveal, PANEL, REVEAL_MARGIN } from './reveal-point';

describe('clearArea', () => {
  it('leaves the panel column out on a wide screen', () => {
    const area = clearArea(1440, 900);
    expect(area.right).toBe(1440 - PANEL.desktopWidth);
    expect(area.bottom).toBe(900);
  });

  it('leaves the bottom sheet out on a narrow screen', () => {
    const area = clearArea(390, 844);
    expect(area.right).toBe(390);
    expect(area.bottom).toBeCloseTo(844 * 0.3, 5);
  });

  it('switches at the breakpoint the layout switches at', () => {
    expect(clearArea(PANEL.breakpointPx, 900).right).toBe(PANEL.breakpointPx - PANEL.desktopWidth);
    expect(clearArea(PANEL.breakpointPx - 1, 900).right).toBe(PANEL.breakpointPx - 1);
  });

  it('never returns a negative width on a very narrow wide-layout screen', () => {
    expect(clearArea(PANEL.breakpointPx, 900).right).toBeGreaterThanOrEqual(0);
  });
});

describe('panToReveal', () => {
  const desktop = clearArea(1440, 900);
  const phone = clearArea(390, 844);

  it('does not move a tree already in clear space', () => {
    expect(panToReveal({ x: 400, y: 400 }, desktop)).toBeNull();
    expect(panToReveal({ x: 195, y: 120 }, phone)).toBeNull();
  });

  it('pans a tree out from under the right-hand panel', () => {
    // 1300 is inside the panel column on a 1440 screen.
    const move = panToReveal({ x: 1300, y: 400 }, desktop);
    expect(move).not.toBeNull();
    expect(move!.dx).toBeGreaterThan(0);
    expect(move!.dy).toBe(0);
    // After panning it sits a margin inside the clear edge.
    expect(1300 - move!.dx).toBeCloseTo(desktop.right - REVEAL_MARGIN, 5);
  });

  it('pans a tree out from under the bottom sheet', () => {
    const move = panToReveal({ x: 195, y: 600 }, phone);
    expect(move).not.toBeNull();
    expect(move!.dy).toBeGreaterThan(0);
    expect(600 - move!.dy).toBeCloseTo(phone.bottom - REVEAL_MARGIN, 5);
  });

  it('pans a tree in from the left and top edges too', () => {
    // Off the other edges the panel is not the problem, but a tree half
    // off-screen is still a tree you cannot see.
    expect(panToReveal({ x: 5, y: 400 }, desktop)!.dx).toBeLessThan(0);
    expect(panToReveal({ x: 400, y: 5 }, desktop)!.dy).toBeLessThan(0);
  });

  it('moves in both directions at once for a corner', () => {
    const move = panToReveal({ x: 1400, y: 880 }, desktop);
    expect(move!.dx).toBeGreaterThan(0);
    expect(move!.dy).toBeGreaterThan(0);
  });

  it('brings the point into the area, whatever the starting point', () => {
    for (const area of [desktop, phone]) {
      for (const p of [
        { x: -50, y: -50 },
        { x: 5000, y: 5000 },
        { x: 0, y: 500 },
        { x: 1439, y: 1 },
      ]) {
        const move = panToReveal(p, area) ?? { dx: 0, dy: 0 };
        const after = { x: p.x - move.dx, y: p.y - move.dy };
        expect(after.x, JSON.stringify(p)).toBeGreaterThanOrEqual(area.left);
        expect(after.x, JSON.stringify(p)).toBeLessThanOrEqual(area.right);
        expect(after.y, JSON.stringify(p)).toBeGreaterThanOrEqual(area.top);
        expect(after.y, JSON.stringify(p)).toBeLessThanOrEqual(area.bottom);
      }
    }
  });

  it('does not overshoot when the clear area is narrower than the margin', () => {
    // A very small window leaves a sliver of map. Asking for a 48px margin
    // inside a 40px strip would push the point out the opposite side.
    const sliver = { left: 0, top: 0, right: 40, bottom: 40 };
    const move = panToReveal({ x: 200, y: 200 }, sliver);
    const after = { x: 200 - move!.dx, y: 200 - move!.dy };
    expect(after.x).toBeGreaterThanOrEqual(0);
    expect(after.x).toBeLessThanOrEqual(40);
    expect(after.y).toBeGreaterThanOrEqual(0);
    expect(after.y).toBeLessThanOrEqual(40);
  });
});
