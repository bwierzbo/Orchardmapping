import { describe, it, expect } from 'vitest';
import {
  bushelPounds,
  describeHarvest,
  toPounds,
  BUSHEL_LB,
  HARVEST_UNITS,
  KG_PER_LB,
} from './harvest-units';

describe('bushelPounds', () => {
  it('knows apples and pears differ', () => {
    expect(bushelPounds('apple')).toBe(42);
    expect(bushelPounds('pear')).toBe(50);
  });

  it('is case and whitespace insensitive', () => {
    expect(bushelPounds(' Pear ')).toBe(50);
    expect(bushelPounds('APPLE')).toBe(42);
  });

  it('falls back to apples for fruit with no bushel figure', () => {
    expect(bushelPounds('quince')).toBe(42);
    expect(bushelPounds(null)).toBe(42);
    expect(bushelPounds(undefined)).toBe(42);
    expect(bushelPounds('')).toBe(42);
  });
});

describe('toPounds', () => {
  it('leaves pounds alone', () => {
    expect(toPounds(42, 'lb')).toBe(42);
  });

  it('converts kilograms', () => {
    expect(toPounds(100, 'kg')).toBe(220.5);
    expect(toPounds(1, 'kg')).toBe(round1(1 / KG_PER_LB));
  });

  it('converts bushels by fruit', () => {
    expect(toPounds(3, 'bushel', 'apple')).toBe(126);
    expect(toPounds(3, 'bushel', 'pear')).toBe(150);
  });

  it('uses the apple bushel when the fruit is unknown', () => {
    expect(toPounds(1, 'bushel')).toBe(BUSHEL_LB.apple);
  });

  it('rounds to the one decimal the column stores', () => {
    // 7 kg is 15.4323… lb; the column is DECIMAL(10,1).
    expect(toPounds(7, 'kg')).toBe(15.4);
  });

  it('refuses a harvest of nothing rather than storing a zero', () => {
    // A stored 0 reads as "picked, yielded none", which is a different claim.
    expect(toPounds(0, 'lb')).toBeNull();
    expect(toPounds(-5, 'lb')).toBeNull();
    expect(toPounds(NaN, 'lb')).toBeNull();
    expect(toPounds(Infinity, 'kg')).toBeNull();
  });

  it('handles every unit it offers', () => {
    for (const u of HARVEST_UNITS) {
      expect(typeof toPounds(2, u, 'apple')).toBe('number');
    }
  });
});

describe('describeHarvest', () => {
  it('shows the conversion so the entered figure stays recognisable', () => {
    expect(describeHarvest(3, 'bushel', 'apple')).toBe('3 bushels (126 lb)');
    expect(describeHarvest(1, 'bushel', 'pear')).toBe('1 bushel (50 lb)');
    expect(describeHarvest(20, 'kg')).toBe('20 kg (44.1 lb)');
  });

  it('does not say pounds twice', () => {
    expect(describeHarvest(42, 'lb')).toBe('42 lb');
  });

  it('still reads sensibly for a quantity it would refuse', () => {
    expect(describeHarvest(0, 'bushel', 'apple')).toBe('0 bushels');
  });
});

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
