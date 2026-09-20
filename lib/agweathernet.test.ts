import { describe, it, expect } from 'vitest';
import { foldToHours, milesBetween } from './agweathernet';

/** Four quarter-hour observations, as the API returns them. */
const q = (datetime: string, tempF: number, precipIn = 0, rh = 80, lw?: number) => ({
  Datetime: datetime,
  AT_F: String(tempF),
  PRECIP_IN: String(precipIn),
  RELATIVE_HUMIDITY: String(rh),
  ...(lw === undefined ? {} : { LW_UNITIY: String(lw) }),
});

describe('foldToHours', () => {
  it('averages temperature and SUMS rainfall across the quarter-hours', () => {
    // Four 0.01 in readings are an hour of 0.04 in, not 0.01
    const rows = [
      q('2026-04-10 06:00:00', 50, 0.01),
      q('2026-04-10 06:15:00', 52, 0.01),
      q('2026-04-10 06:30:00', 54, 0.01),
      q('2026-04-10 06:45:00', 56, 0.01),
    ];
    const [h] = foldToHours(rows);
    expect(h.ts).toBe('2026-04-10T06:00');
    expect((h.tempC * 9) / 5 + 32).toBeCloseTo(53, 1);
    expect(h.precipMm).toBeCloseTo(0.04 * 25.4, 3);
  });

  it('splits into separate hours', () => {
    const out = foldToHours([
      q('2026-04-10 06:00:00', 50),
      q('2026-04-10 07:00:00', 60),
    ]);
    expect(out.map((h) => h.ts)).toEqual(['2026-04-10T06:00', '2026-04-10T07:00']);
  });

  it('scales LW_UNITY to 0-100 so the defined wet point lands at 40', () => {
    const [h] = foldToHours([q('2026-04-10 06:00:00', 50, 0, 95, 0.4)]);
    expect(h.leafWetnessPct).toBeCloseTo(40, 3);
  });

  it('leaves leaf wetness null when the station has no sensor', () => {
    const [h] = foldToHours([q('2026-04-10 06:00:00', 50)]);
    expect(h.leafWetnessPct).toBeNull();
  });

  it("treats the API's NA as missing, not as zero", () => {
    const [h] = foldToHours([
      { Datetime: '2026-04-10 06:00:00', AT_F: '50', PRECIP_IN: 'NA', RELATIVE_HUMIDITY: 'NA' },
    ]);
    expect(h.precipMm).toBeNull();
    expect(h.rhPct).toBeNull();
    expect(h.tempC).toBeCloseTo(10, 1);
  });

  it('drops an hour with no temperature at all', () => {
    expect(foldToHours([{ Datetime: '2026-04-10 06:00:00', AT_F: 'NA' }])).toEqual([]);
  });

  it('ignores rows with no timestamp', () => {
    expect(foldToHours([{ AT_F: '50' }])).toEqual([]);
  });

  it('returns hours in order regardless of input order', () => {
    const out = foldToHours([
      q('2026-04-10 08:00:00', 60),
      q('2026-04-10 06:00:00', 50),
      q('2026-04-10 07:00:00', 55),
    ]);
    expect(out.map((h) => h.ts)).toEqual([
      '2026-04-10T06:00', '2026-04-10T07:00', '2026-04-10T08:00',
    ]);
  });
});

describe('milesBetween', () => {
  it('measures the orchard to its two candidate stations', () => {
    const orchard = { lat: 48.1134, lng: -123.2532 };
    expect(milesBetween(orchard.lat, orchard.lng, 48.1, -123.18)).toBeCloseTo(3.5, 0);
    expect(milesBetween(orchard.lat, orchard.lng, 48.11, -123.48)).toBeCloseTo(10.5, 0);
  });

  it('is zero for the same point and symmetric', () => {
    expect(milesBetween(48, -123, 48, -123)).toBe(0);
    expect(milesBetween(48, -123, 49, -124)).toBeCloseTo(milesBetween(49, -124, 48, -123), 6);
  });
});
