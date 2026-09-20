import { describe, it, expect } from 'vitest';
import { parseStationReadings } from './station-ingest';

const ok = (r: ReturnType<typeof parseStationReadings>) => {
  if ('error' in r) throw new Error(`expected success, got: ${r.error}`);
  return r;
};

describe('parseStationReadings', () => {
  it('folds sub-hourly readings, averaging temperature and SUMMING rain', () => {
    // A station reporting every 15 min sends four partial rain totals;
    // their mean would be a quarter of the hour's rainfall.
    const r = ok(parseStationReadings({
      orchardId: 'finn-hall',
      readings: [
        { time: '2026-04-10 06:00:00', tempf: 50, humidity: 90, hourlyrainin: 0.01 },
        { time: '2026-04-10 06:15:00', tempf: 52, humidity: 92, hourlyrainin: 0.01 },
        { time: '2026-04-10 06:30:00', tempf: 54, humidity: 94, hourlyrainin: 0.01 },
        { time: '2026-04-10 06:45:00', tempf: 56, humidity: 96, hourlyrainin: 0.01 },
      ],
    }));
    expect(r.hours).toHaveLength(1);
    const [h] = r.hours;
    expect((h.tempC * 9) / 5 + 32).toBeCloseTo(53, 1);
    expect(h.rhPct).toBeCloseTo(93, 1);
    expect(h.precipMm).toBeCloseTo(0.04 * 25.4, 3);
  });

  it('accepts Celsius or Fahrenheit', () => {
    const f = ok(parseStationReadings({
      orchardId: 'x', readings: [{ time: '2026-04-10 06:00:00', tempf: 50 }],
    }));
    const c = ok(parseStationReadings({
      orchardId: 'x', readings: [{ time: '2026-04-10 06:00:00', temp_c: 10 }],
    }));
    expect(f.hours[0].tempC).toBeCloseTo(10, 6);
    expect(c.hours[0].tempC).toBeCloseTo(10, 6);
  });

  it('accepts millimetres or inches of rain', () => {
    const mm = ok(parseStationReadings({
      orchardId: 'x', readings: [{ time: '2026-04-10 06:00:00', tempc: 10, rain_mm: 2.54 }],
    }));
    const inches = ok(parseStationReadings({
      orchardId: 'x', readings: [{ time: '2026-04-10 06:00:00', tempc: 10, rainin: 0.1 }],
    }));
    expect(mm.hours[0].precipMm).toBeCloseTo(2.54, 3);
    expect(inches.hours[0].precipMm).toBeCloseTo(2.54, 3);
  });

  it('reads leaf wetness as unity below 1 and percent above', () => {
    // AgWeatherNet's LW_UNITY defines 0.4 as wet; consumer sensors
    // usually report a percentage.
    const unity = ok(parseStationReadings({
      orchardId: 'x', readings: [{ time: '2026-04-10 06:00:00', tempc: 10, leafwetness: 0.4 }],
    }));
    const pct = ok(parseStationReadings({
      orchardId: 'x', readings: [{ time: '2026-04-10 06:00:00', tempc: 10, leafwetness: 65 }],
    }));
    expect(unity.hours[0].leafWetnessPct).toBeCloseTo(40, 3);
    expect(pct.hours[0].leafWetnessPct).toBeCloseTo(65, 3);
    expect(unity.measuresLeafWetness).toBe(true);
  });

  it('reports no leaf wetness when the station has no sensor', () => {
    const r = ok(parseStationReadings({
      orchardId: 'x', readings: [{ time: '2026-04-10 06:00:00', tempf: 50 }],
    }));
    expect(r.measuresLeafWetness).toBe(false);
    expect(r.hours[0].leafWetnessPct).toBeNull();
  });

  it('is case-insensitive about field names', () => {
    const r = ok(parseStationReadings({
      orchardId: 'x', readings: [{ TIME: '2026-04-10 06:00:00', TempF: 50, Humidity: 88 }],
    }));
    expect(r.hours[0].rhPct).toBe(88);
  });

  it('skips unusable rows without failing the whole post', () => {
    const r = ok(parseStationReadings({
      orchardId: 'x',
      readings: [
        { time: 'nonsense', tempf: 50 },
        { tempf: 50 },
        { time: '2026-04-10 06:00:00' },
        { time: '2026-04-10 06:00:00', tempf: 50 },
      ],
    }));
    expect(r.hours).toHaveLength(1);
  });

  it('rejects a post with nothing usable in it', () => {
    const r = parseStationReadings({ orchardId: 'x', readings: [{ time: 'nope' }] });
    expect('error' in r && r.error).toMatch(/usable timestamp and temperature/);
  });

  it('requires an orchard and some readings', () => {
    expect('error' in parseStationReadings({ readings: [] })).toBe(true);
    expect('error' in parseStationReadings({ orchardId: 'x' })).toBe(true);
    expect('error' in parseStationReadings({ orchardId: 'x', readings: [] })).toBe(true);
  });

  it('refuses an implausibly large post rather than chewing on it', () => {
    const readings = Array.from({ length: 5001 }, () => ({
      time: '2026-04-10 06:00:00', tempf: 50,
    }));
    expect('error' in parseStationReadings({ orchardId: 'x', readings })).toBe(true);
  });

  it('returns hours in order across a multi-hour post', () => {
    const r = ok(parseStationReadings({
      orchardId: 'x',
      readings: [
        { time: '2026-04-10 08:00:00', tempf: 60 },
        { time: '2026-04-10 06:00:00', tempf: 50 },
        { time: '2026-04-10 07:00:00', tempf: 55 },
      ],
    }));
    expect(r.hours.map((h) => h.ts)).toEqual([
      '2026-04-10T06:00', '2026-04-10T07:00', '2026-04-10T08:00',
    ]);
  });
});
