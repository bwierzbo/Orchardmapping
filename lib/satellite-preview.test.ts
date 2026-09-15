import { describe, it, expect } from 'vitest';
import { previewBounds, satellitePreviewUrl, boundarySvgPoints } from './satellite-preview';
import type { OrchardBounds, OrchardBoundary } from './types';

const BOUNDS: OrchardBounds = {
  minLng: -123.115,
  minLat: 48.107,
  maxLng: -123.111,
  maxLat: 48.109,
};

describe('previewBounds', () => {
  it('contains the original bounds with padding', () => {
    const p = previewBounds(BOUNDS, 660, 440);
    expect(p.minLng).toBeLessThan(BOUNDS.minLng);
    expect(p.maxLng).toBeGreaterThan(BOUNDS.maxLng);
    expect(p.minLat).toBeLessThan(BOUNDS.minLat);
    expect(p.maxLat).toBeGreaterThan(BOUNDS.maxLat);
  });

  it('matches the requested aspect ratio in ground meters', () => {
    const p = previewBounds(BOUNDS, 660, 440);
    const cos = Math.cos(((p.minLat + p.maxLat) / 2) * (Math.PI / 180));
    const spanX = (p.maxLng - p.minLng) * cos;
    const spanY = p.maxLat - p.minLat;
    expect(spanX / spanY).toBeCloseTo(660 / 440, 2);
  });
});

describe('satellitePreviewUrl', () => {
  it('builds an Esri export URL with the padded bbox', () => {
    const url = satellitePreviewUrl(BOUNDS);
    expect(url).toContain('World_Imagery/MapServer/export');
    expect(url).toContain('f=image');
    expect(url).toContain('size=660%2C440');
    const bbox = new URL(url).searchParams.get('bbox')!.split(',').map(Number);
    expect(bbox).toHaveLength(4);
    expect(bbox[0]).toBeLessThan(BOUNDS.minLng);
  });
});

describe('boundarySvgPoints', () => {
  it('projects the ring into image pixel space', () => {
    const boundary: OrchardBoundary = {
      type: 'Polygon',
      coordinates: [
        [
          [-123.115, 48.107],
          [-123.111, 48.107],
          [-123.111, 48.109],
          [-123.115, 48.109],
          [-123.115, 48.107],
        ],
      ],
    };
    const pts = boundarySvgPoints(boundary, BOUNDS, 660, 440);
    const coords = pts.split(' ').map((p) => p.split(',').map(Number));
    expect(coords).toHaveLength(5);
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(660);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(440);
    }
  });
});
