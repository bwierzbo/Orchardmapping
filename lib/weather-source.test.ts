import { describe, it, expect } from 'vitest';
import {
  interpolateHour,
  resolveHour,
  resolveHours,
  sourceCoverage,
  type SourcedHour,
  type WeatherSourceMeta,
} from './weather-source';

const SOURCES: WeatherSourceMeta[] = [
  { source: 'onsite', kind: 'onsite', label: 'Orchard station', priority: 10,
    measuresLeafWetness: true, enabled: true },
  { source: 'sequim', kind: 'station', label: 'Sequim (AWN)', priority: 20,
    measuresLeafWetness: false, enabled: true },
  { source: 'openmeteo', kind: 'gridded', label: 'Open-Meteo', priority: 90,
    measuresLeafWetness: false, enabled: true },
];

const hour = (source: string, o: Partial<SourcedHour> = {}): SourcedHour => ({
  source,
  ts: '2026-04-10T06:00',
  tempC: 10,
  precipMm: 0,
  rhPct: 80,
  leafWetnessPct: null,
  ...o,
});

describe('resolveHour', () => {
  it('prefers the higher-priority source', () => {
    const r = resolveHour(
      [hour('openmeteo', { tempC: 12 }), hour('sequim', { tempC: 9 })],
      SOURCES
    )!;
    expect(r.tempC).toBe(9);
    expect(r.provenance.tempC).toBe('sequim');
  });

  it('falls back PER FIELD, not per row', () => {
    // The station gauge failed; its temperature is still the best there is
    const r = resolveHour(
      [
        hour('sequim', { tempC: 9, precipMm: null }),
        hour('openmeteo', { tempC: 12, precipMm: 1.4 }),
      ],
      SOURCES
    )!;
    expect(r.tempC).toBe(9);
    expect(r.provenance.tempC).toBe('sequim');
    expect(r.precipMm).toBe(1.4);
    expect(r.provenance.precipMm).toBe('openmeteo');
  });

  it('only lets a source supply leaf wetness if it MEASURES it', () => {
    // Open-Meteo publishes a modelled dew probability — it read 6% on a
    // rainy December day here — so it must never fill this field.
    const r = resolveHour([hour('openmeteo', { leafWetnessPct: 88 })], SOURCES)!;
    expect(r.leafWetnessPct).toBeNull();
    expect(r.provenance.leafWetnessPct).toBeNull();
  });

  it('accepts leaf wetness from a source that measures it', () => {
    const r = resolveHour(
      [hour('openmeteo', { leafWetnessPct: 88 }), hour('onsite', { leafWetnessPct: 42 })],
      SOURCES
    )!;
    expect(r.leafWetnessPct).toBe(42);
    expect(r.provenance.leafWetnessPct).toBe('onsite');
  });

  it('skips a disabled source entirely', () => {
    const off = SOURCES.map((s) =>
      s.source === 'sequim' ? { ...s, enabled: false } : s
    );
    const r = resolveHour([hour('sequim', { tempC: 9 }), hour('openmeteo', { tempC: 12 })], off)!;
    expect(r.tempC).toBe(12);
  });

  it('is null when nothing usable remains', () => {
    expect(resolveHour([], SOURCES)).toBeNull();
    const allOff = SOURCES.map((s) => ({ ...s, enabled: false }));
    expect(resolveHour([hour('sequim')], allOff)).toBeNull();
  });

  it('treats an unknown source as lowest priority rather than dropping it', () => {
    const r = resolveHour([hour('mystery', { tempC: 7 })], SOURCES)!;
    expect(r.tempC).toBe(7);
  });
});

describe('resolveHours', () => {
  it('groups by timestamp and returns them in order', () => {
    const rows = [
      hour('openmeteo', { ts: '2026-04-10T07:00', tempC: 12 }),
      hour('sequim', { ts: '2026-04-10T06:00', tempC: 9 }),
      hour('openmeteo', { ts: '2026-04-10T06:00', tempC: 11 }),
    ];
    const out = resolveHours(rows, SOURCES);
    expect(out.map((h) => h.ts)).toEqual(['2026-04-10T06:00', '2026-04-10T07:00']);
    expect(out[0].tempC).toBe(9);
    expect(out[1].tempC).toBe(12);
  });
});

describe('sourceCoverage', () => {
  it('reports how much of a run was actually measured', () => {
    const resolved = resolveHours(
      [
        hour('sequim', { ts: '2026-04-10T06:00', tempC: 9 }),
        hour('openmeteo', { ts: '2026-04-10T06:00', tempC: 11 }),
        hour('openmeteo', { ts: '2026-04-10T07:00', tempC: 12 }),
      ],
      SOURCES
    );
    const cov = sourceCoverage(resolved, SOURCES);
    const sequim = cov.find((c) => c.source === 'sequim')!;
    const grid = cov.find((c) => c.source === 'openmeteo')!;
    expect(sequim.suppliedTemp).toBeCloseTo(0.5, 2);
    expect(grid.suppliedTemp).toBeCloseTo(0.5, 2);
  });
});

describe('interpolateHour', () => {
  const pa = hour('pa', { tempC: 10, precipMm: 4, rhPct: 90 });
  const sq = hour('sequim', { tempC: 12, precipMm: 1, rhPct: 80 });

  it('weights toward the nearer station', () => {
    // This orchard sits 76% of the way from Port Angeles toward Sequim
    const r = interpolateHour(pa, sq, 0.76)!;
    expect(r.tempC).toBeCloseTo(11.52, 2);
    expect(r.precipMm).toBeCloseTo(1.72, 2);
    expect(r.rhPct).toBeCloseTo(82.4, 1);
  });

  it('returns each endpoint at the extremes', () => {
    expect(interpolateHour(pa, sq, 0)!.tempC).toBe(10);
    expect(interpolateHour(pa, sq, 1)!.tempC).toBe(12);
  });

  it('clamps a weight outside 0..1', () => {
    expect(interpolateHour(pa, sq, 2)!.tempC).toBe(12);
    expect(interpolateHour(pa, sq, -1)!.tempC).toBe(10);
  });

  it('never interpolates leaf wetness', () => {
    const withSensors = [
      { ...pa, leafWetnessPct: 100 },
      { ...sq, leafWetnessPct: 0 },
    ];
    expect(interpolateHour(withSensors[0], withSensors[1], 0.5)!.leafWetnessPct).toBeNull();
  });

  it('refuses to mix hours that are not the same hour', () => {
    expect(interpolateHour(pa, { ...sq, ts: '2026-04-10T07:00' }, 0.5)).toBeNull();
  });

  it('drops a field where either endpoint is missing', () => {
    const r = interpolateHour(pa, { ...sq, precipMm: null }, 0.5)!;
    expect(r.precipMm).toBeNull();
    expect(r.tempC).toBeCloseTo(11, 2);
  });
});
