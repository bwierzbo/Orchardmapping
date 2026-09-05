import { describe, it, expect } from 'vitest';
import { generateTreeGrid } from './tree-grid';
import type { OrchardBoundary } from './types';

// Finn Hall: ~78 m east-west by ~155 m north-south
const TALL: OrchardBoundary = {
  type: 'Polygon',
  coordinates: [
    [
      [-123.253753, 48.112688],
      [-123.252699, 48.112688],
      [-123.252699, 48.114081],
      [-123.253753, 48.114081],
      [-123.253753, 48.112688],
    ],
  ],
};

// Same block turned on its side
const WIDE: OrchardBoundary = {
  type: 'Polygon',
  coordinates: [
    [
      [-123.2560, 48.1130],
      [-123.2530, 48.1130],
      [-123.2530, 48.1136],
      [-123.2560, 48.1136],
      [-123.2560, 48.1130],
    ],
  ],
};

describe('generateTreeGrid', () => {
  it('produces rows x positions trees', () => {
    const plan = generateTreeGrid(TALL, 15, 32);
    expect(plan.trees).toHaveLength(480);
    expect(new Set(plan.trees.map((t) => t.row_id)).size).toBe(15);
    expect(new Set(plan.trees.map((t) => t.position)).size).toBe(32);
  });

  it('runs rows along the long axis and reports realistic spacing', () => {
    const plan = generateTreeGrid(TALL, 15, 32);
    expect(plan.rowAxis).toBe('north-south');
    expect(plan.rowSpacingM).toBeCloseTo(5.2, 1);
    expect(plan.treeSpacingM).toBeCloseTo(4.8, 1);
  });

  it('flips the axis for a block that is wider than it is tall', () => {
    const plan = generateTreeGrid(WIDE, 4, 20);
    expect(plan.rowAxis).toBe('east-west');
  });

  it('insets trees half a spacing from the boundary', () => {
    const plan = generateTreeGrid(TALL, 15, 32);
    const lngs = plan.trees.map((t) => t.lng);
    const lats = plan.trees.map((t) => t.lat);
    expect(Math.min(...lngs)).toBeGreaterThan(-123.253753);
    expect(Math.max(...lngs)).toBeLessThan(-123.252699);
    expect(Math.min(...lats)).toBeGreaterThan(48.112688);
    expect(Math.max(...lats)).toBeLessThan(48.114081);
  });

  it('numbers position 1 at the north end of a north-south row', () => {
    const plan = generateTreeGrid(TALL, 15, 32);
    const row1 = plan.trees.filter((t) => t.row_id === '1').sort((a, b) => a.position - b.position);
    expect(row1[0].lat).toBeGreaterThan(row1[row1.length - 1].lat);
  });

  it('rejects nonsense dimensions', () => {
    expect(() => generateTreeGrid(TALL, 0, 10)).toThrow();
    expect(() => generateTreeGrid(TALL, 10, 1.5)).toThrow();
  });
});
