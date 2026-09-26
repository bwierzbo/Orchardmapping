import { describe, it, expect } from 'vitest';
import {
  contentBounds,
  previewBounds,
  satellitePreviewUrl,
  boundarySvgPoints,
  cardSource,
  dotRadius,
  dotStrokeWidth,
  DOT_RADIUS_MAX,
  DOT_RADIUS_MIN,
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

describe('cardSource', () => {
  const BOUNDS: OrchardBounds = STORED;
  const CARD = 'https://x.public.blob.vercel-storage.com/orchards/a/preview/card-v2.jpg';

  it('keeps the photograph when there is nothing to draw over it', () => {
    expect(
      cardSource({ previewImage: CARD, bounds: BOUNDS, placedTrees: 0 })
    ).toBe('uploaded');
  });

  it('composes once a boundary has been traced, because the photo cannot carry one', () => {
    // Farm House and Marty Huffman's: a boundary was drawn and never
    // appeared, because the overlay only existed on the composed branch
    // and both orchards had an uploaded card.
    expect(
      cardSource({ previewImage: CARD, boundary: RING, bounds: BOUNDS, placedTrees: 0 })
    ).toBe('composed');
  });

  it('composes once trees are placed, so the planting is visible', () => {
    expect(
      cardSource({ previewImage: CARD, bounds: BOUNDS, placedTrees: 78 })
    ).toBe('composed');
  });

  it('is not fooled by a boundary whose ring is empty', () => {
    const empty: OrchardBoundary = { type: 'Polygon', coordinates: [[]] };
    expect(
      cardSource({ previewImage: CARD, boundary: empty, bounds: BOUNDS, placedTrees: 0 })
    ).toBe('uploaded');
  });

  it('composes for an orchard that never had a photograph', () => {
    expect(cardSource({ bounds: BOUNDS, placedTrees: 0 })).toBe('composed');
  });
});

describe('dotRadius', () => {
  const grid = (cols: number, rows: number, gap: number) =>
    Array.from({ length: cols * rows }, (_, i) => ({
      x: (i % cols) * gap,
      y: Math.floor(i / cols) * gap,
    }));

  it('gives a lone tree the biggest dot — nothing competes for the space', () => {
    expect(dotRadius([{ x: 100, y: 100 }])).toBe(DOT_RADIUS_MAX);
    expect(dotRadius([])).toBe(DOT_RADIUS_MAX);
  });

  it('gives three trees in a line the biggest dot, not a divide-by-zero', () => {
    // Terry Anderson: the span down the card is exactly zero.
    const inLine = [
      { x: 320, y: 220 },
      { x: 330, y: 220 },
      { x: 340, y: 220 },
    ];
    expect(dotRadius(inLine)).toBe(DOT_RADIUS_MAX);
  });

  it('shrinks the dot for a dense planting so neighbours stay apart', () => {
    // Olympic Bluffs: 480 trees, roughly 7px apart across the row.
    const dense = grid(24, 20, 7);
    const r = dotRadius(dense);
    expect(r).toBeLessThan(DOT_RADIUS_MAX);
    expect(r * 2).toBeLessThan(7); // two dots do not touch
  });

  it('leaves a sparse planting at full size', () => {
    expect(dotRadius(grid(8, 8, 40))).toBe(DOT_RADIUS_MAX);
  });

  it('never goes below the floor, however tightly packed', () => {
    expect(dotRadius(grid(60, 60, 1))).toBeGreaterThanOrEqual(DOT_RADIUS_MIN);
  });

  it('is monotonic — closer planting never gives a bigger dot', () => {
    const gaps = [40, 20, 10, 5, 2];
    const radii = gaps.map((g) => dotRadius(grid(20, 20, g)));
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeLessThanOrEqual(radii[i - 1]);
    }
  });
});

describe('dotStrokeWidth', () => {
  it('rings a full-size dot, which is the sparse case', () => {
    expect(dotStrokeWidth(DOT_RADIUS_MAX)).toBeGreaterThan(0);
  });

  it('drops the ring once the dot has been shrunk for density', () => {
    // Olympic Bluffs sits at about 3.4, and 480 ringed dots at that
    // size read as a pegboard rather than an orchard.
    expect(dotStrokeWidth(3.4)).toBe(0);
    expect(dotStrokeWidth(DOT_RADIUS_MIN)).toBe(0);
  });

  it('never draws a ring wider than the dot it surrounds', () => {
    for (const r of [DOT_RADIUS_MIN, 2, 3, 4, DOT_RADIUS_MAX]) {
      expect(dotStrokeWidth(r)).toBeLessThan(r);
    }
  });
});
