import { describe, it, expect } from 'vitest';
import { sgToBrix, brixToSg } from './sugar';

describe('sgToBrix / brixToSg', () => {
  it('maps typical apple juice SG 1.050 to ~12.4 Brix', () => {
    const brix = sgToBrix(1.05);
    expect(brix).toBeGreaterThan(12.0);
    expect(brix).toBeLessThan(12.8);
  });

  it('maps water to ~0 both ways', () => {
    expect(sgToBrix(1.0)).toBeCloseTo(0, 1);
    expect(brixToSg(0)).toBe(1.0);
  });

  it('round-trips within tolerance across the fruit range', () => {
    for (let sg = 1.02; sg <= 1.08; sg += 0.01) {
      const rt = brixToSg(sgToBrix(sg));
      expect(Math.abs(rt - sg)).toBeLessThan(0.001);
    }
  });
});
