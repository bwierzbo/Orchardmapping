import { describe, it, expect } from 'vitest';
import {
  contentBounds,
  previewBounds,
  satellitePreviewUrl,
  boundarySvgPoints,
  MIN_PREVIEW_SPAN_M,
} from './satellite-preview';
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

/**
 * Framing, added after Terry Anderson's card came out showing three
 * trees filling one percent of the width of a half-kilometre field.
 */
const M_PER_DEG_LAT = 111_320;
const spanMetres = (b: OrchardBounds) => ({
  across: (b.maxLng - b.minLng) * M_PER_DEG_LAT * Math.cos((48.1 * Math.PI) / 180),
  down: (b.maxLat - b.minLat) * M_PER_DEG_LAT,
});

/** Terry Anderson: added from one found tree, so the stored box is a guess. */
const STORED: OrchardBounds = {
  minLng: -123.16388259,
  minLat: 48.10428533,
  maxLng: -123.15984681,
  maxLat: 48.10698027,
};
/** Its three trees, about seven metres apart and all on one line. */
const TREES: OrchardBounds = {
  minLng: -123.1619,
  minLat: 48.105632,
  maxLng: -123.16181,
  maxLat: 48.105632,
};

const RING: OrchardBoundary = {
  type: 'Polygon',
  coordinates: [
    [
      [-123.2537, 48.1127],
      [-123.2527, 48.1127],
      [-123.2527, 48.1141],
      [-123.2537, 48.1141],
    ],
  ],
};

describe('contentBounds', () => {
  it('frames the trees rather than the stored imagery footprint', () => {
    const framed = contentBounds(TREES, null, STORED);
    expect(framed).toEqual(TREES);
    expect(spanMetres(framed).across).toBeLessThan(spanMetres(STORED).across);
  });

  it('covers the boundary and the trees together when both exist', () => {
    const framed = contentBounds(TREES, RING, STORED);
    expect(framed.minLng).toBeLessThanOrEqual(-123.2537);
    expect(framed.maxLng).toBeGreaterThanOrEqual(-123.16181);
    expect(framed.maxLat).toBeGreaterThanOrEqual(48.1141);
  });

  it('uses the boundary alone for an orchard with no trees placed yet', () => {
    const framed = contentBounds(null, RING, STORED);
    expect(framed.minLat).toBeCloseTo(48.1127, 6);
    expect(framed.maxLat).toBeCloseTo(48.1141, 6);
  });

  it('falls back to the stored bounds when nothing is mapped at all', () => {
    expect(contentBounds(null, null, STORED)).toEqual(STORED);
  });

  it('ignores a boundary whose ring is empty rather than framing nothing', () => {
    const empty: OrchardBoundary = { type: 'Polygon', coordinates: [[]] };
    expect(contentBounds(null, empty, STORED)).toEqual(STORED);
  });
});

describe('previewBounds framing floor', () => {
  it('opens a near-zero span out to something the imagery can fill', () => {
    const box = previewBounds(contentBounds(TREES, null, STORED), 660, 440);
    const { across, down } = spanMetres(box);
    expect(down).toBeGreaterThanOrEqual(MIN_PREVIEW_SPAN_M * 0.99);
    expect(across).toBeGreaterThanOrEqual(MIN_PREVIEW_SPAN_M * 0.99);
  });

  it('keeps the planting centred after opening out', () => {
    const box = previewBounds(contentBounds(TREES, null, STORED), 660, 440);
    expect((box.minLng + box.maxLng) / 2).toBeCloseTo(
      (TREES.minLng + TREES.maxLng) / 2,
      5
    );
    expect((box.minLat + box.maxLat) / 2).toBeCloseTo(TREES.minLat, 5);
  });

  it('survives a single tree, where the span is exactly zero both ways', () => {
    const point: OrchardBounds = {
      minLng: -123.1619, maxLng: -123.1619,
      minLat: 48.10563, maxLat: 48.10563,
    };
    const box = previewBounds(point, 660, 440);
    expect(satellitePreviewUrl(point)).not.toContain('NaN');
    expect(spanMetres(box).down).toBeGreaterThanOrEqual(MIN_PREVIEW_SPAN_M * 0.99);
  });

  it('is a floor, not a zoom — a big orchard is framed as before', () => {
    const before = spanMetres(STORED);
    const after = spanMetres(previewBounds(STORED, 660, 440));
    expect(after.across).toBeGreaterThan(before.across);
    expect(after.across).toBeGreaterThan(MIN_PREVIEW_SPAN_M * 2);
  });

  it('still matches the image aspect once the floor has applied', () => {
    const box = previewBounds(contentBounds(TREES, null, STORED), 660, 440);
    const { across, down } = spanMetres(box);
    expect(across / down).toBeCloseTo(660 / 440, 1);
  });
});
