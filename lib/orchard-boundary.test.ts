import { describe, it, expect } from 'vitest';
import {
  parseBoundary,
  boundaryBounds,
  boundaryCenter,
  zoomForBounds,
} from './orchard-boundary';

const SQUARE = {
  type: 'Polygon',
  coordinates: [
    [
      [-123.2, 48.1],
      [-123.1, 48.1],
      [-123.1, 48.2],
      [-123.2, 48.2],
      [-123.2, 48.1],
    ],
  ],
};

describe('parseBoundary', () => {
  it('accepts a closed Polygon geometry', () => {
    expect(parseBoundary(SQUARE)).toEqual(SQUARE);
  });

  it('unwraps a Feature', () => {
    expect(parseBoundary({ type: 'Feature', properties: {}, geometry: SQUARE })).toEqual(SQUARE);
  });

  it('closes an open ring', () => {
    const open = {
      type: 'Polygon',
      coordinates: [
        [
          [-123.2, 48.1],
          [-123.1, 48.1],
          [-123.1, 48.2],
          [-123.2, 48.2],
        ],
      ],
    };
    const parsed = parseBoundary(open);
    expect(parsed?.coordinates[0]).toHaveLength(5);
    expect(parsed?.coordinates[0][4]).toEqual([-123.2, 48.1]);
  });

  it('drops elevation from positions', () => {
    const withZ = {
      type: 'Polygon',
      coordinates: [
        [
          [-123.2, 48.1, 30],
          [-123.1, 48.1, 30],
          [-123.1, 48.2, 30],
          [-123.2, 48.1, 30],
        ],
      ],
    };
    expect(parseBoundary(withZ)?.coordinates[0][0]).toEqual([-123.2, 48.1]);
  });

  it('rejects non-polygons and malformed input', () => {
    expect(parseBoundary(null)).toBeUndefined();
    expect(parseBoundary('Polygon')).toBeUndefined();
    expect(parseBoundary({ type: 'Point', coordinates: [-123.2, 48.1] })).toBeUndefined();
    expect(parseBoundary({ type: 'Polygon', coordinates: 'nope' })).toBeUndefined();
  });

  it('rejects rings that cannot close into an area', () => {
    expect(
      parseBoundary({
        type: 'Polygon',
        coordinates: [
          [
            [-123.2, 48.1],
            [-123.1, 48.1],
          ],
        ],
      })
    ).toBeUndefined();
  });

  it('rejects out-of-range and non-numeric coordinates', () => {
    expect(
      parseBoundary({
        type: 'Polygon',
        coordinates: [
          [
            [-181, 48.1],
            [-123.1, 48.1],
            [-123.1, 48.2],
            [-181, 48.1],
          ],
        ],
      })
    ).toBeUndefined();
    expect(
      parseBoundary({
        type: 'Polygon',
        coordinates: [
          [
            ['-123.2', 48.1],
            [-123.1, 48.1],
            [-123.1, 48.2],
            ['-123.2', 48.1],
          ],
        ],
      })
    ).toBeUndefined();
  });
});

describe('boundaryBounds / boundaryCenter', () => {
  const boundary = parseBoundary(SQUARE)!;

  it('takes the bbox of the outer ring', () => {
    expect(boundaryBounds(boundary)).toEqual({
      minLng: -123.2,
      minLat: 48.1,
      maxLng: -123.1,
      maxLat: 48.2,
    });
  });

  it('centres on the bbox', () => {
    const [lng, lat] = boundaryCenter(boundary);
    expect(lng).toBeCloseTo(-123.15, 10);
    expect(lat).toBeCloseTo(48.15, 10);
  });
});

describe('zoomForBounds', () => {
  it('zooms in further for a smaller block', () => {
    const big = zoomForBounds({ minLng: -123.2, minLat: 48.1, maxLng: -123.1, maxLat: 48.2 });
    const small = zoomForBounds({ minLng: -123.2, minLat: 48.1, maxLng: -123.199, maxLat: 48.101 });
    expect(small).toBeGreaterThan(big);
  });

  it('frames a ~150 m orchard block in the high teens', () => {
    const zoom = zoomForBounds({
      minLng: -123.253753,
      minLat: 48.112688,
      maxLng: -123.252699,
      maxLat: 48.114081,
    });
    expect(zoom).toBeGreaterThan(18);
    expect(zoom).toBeLessThan(20);
  });

  it('falls back to the schema default for a degenerate box', () => {
    expect(zoomForBounds({ minLng: -123.2, minLat: 48.1, maxLng: -123.2, maxLat: 48.1 })).toBe(18);
  });

  it('clamps to the usable zoom range', () => {
    const world = zoomForBounds({ minLng: -180, minLat: -85, maxLng: 180, maxLat: 85 });
    expect(world).toBeGreaterThanOrEqual(1);
    expect(world).toBeLessThanOrEqual(22);
  });
});
