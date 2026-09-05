import { describe, it, expect } from 'vitest';
import { buildMapStyle, BOUNDARY_FILL_LAYER, BOUNDARY_LINE_LAYER } from './map-style';
import type { OrchardBoundary, OrchardConfig } from './types';

const BOUNDARY: OrchardBoundary = {
  type: 'Polygon',
  coordinates: [
    [
      [-123.253753, 48.112688],
      [-123.252708, 48.112688],
      [-123.252699, 48.114081],
      [-123.253753, 48.114081],
      [-123.253753, 48.112688],
    ],
  ],
};

function orchard(overrides: Partial<OrchardConfig> = {}): OrchardConfig {
  return {
    id: 'finn-hall',
    name: 'Finn Hall',
    location: '1027 Finn Hall Road, Agnew, WA 98362',
    description: '',
    center: [-123.253226, 48.113384],
    bounds: { minLng: -123.253753, minLat: 48.112688, maxLng: -123.252699, maxLat: 48.114081 },
    defaultZoom: 19,
    minZoom: 5,
    maxZoom: 21.5,
    tileMinZoom: 5,
    tileMaxZoom: 23,
    orthoPath: '',
    pmtilesPath: '',
    ...overrides,
  };
}

const ORIGIN = 'https://example.test';

describe('buildMapStyle boundary', () => {
  it('fills and outlines a boundary when there is no orthomosaic', () => {
    const style = buildMapStyle(orchard({ boundary: BOUNDARY }), ORIGIN);
    const ids = style.layers.map((l) => l.id);
    expect(ids).toContain(BOUNDARY_FILL_LAYER);
    expect(ids).toContain(BOUNDARY_LINE_LAYER);
  });

  it('outlines but does not fill over an orthomosaic', () => {
    const style = buildMapStyle(
      orchard({ boundary: BOUNDARY, orthoPmtilesPath: 'https://blob.test/o.pmtiles' }),
      ORIGIN
    );
    const ids = style.layers.map((l) => l.id);
    expect(ids).not.toContain(BOUNDARY_FILL_LAYER);
    expect(ids).toContain(BOUNDARY_LINE_LAYER);
    // the outline has to sit above the imagery it annotates
    expect(ids.indexOf(BOUNDARY_LINE_LAYER)).toBeGreaterThan(ids.indexOf('orchard-ortho'));
  });

  it('adds no boundary source or layers when the orchard has none', () => {
    const style = buildMapStyle(orchard(), ORIGIN);
    expect(Object.keys(style.sources)).toHaveLength(0);
    expect(style.layers.map((l) => l.id)).toEqual(['background']);
  });

  it('serves the boundary as a GeoJSON feature source', () => {
    const style = buildMapStyle(orchard({ boundary: BOUNDARY }), ORIGIN);
    const source = style.sources['orchard-boundary'];
    expect(source).toMatchObject({
      type: 'geojson',
      data: { type: 'Feature', geometry: BOUNDARY },
    });
  });
});
