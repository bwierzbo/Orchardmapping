'use client';

import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

// Module-level singleton: registering/unregistering the global pmtiles
// protocol per mount races in-flight tile requests under StrictMode.
const protocol = new Protocol();

// 1x1 transparent PNG. PMTiles archives are sparse — tiles outside the
// imagery footprint are absent and the protocol resolves {data: null},
// which MapLibre leaves in 'loading' forever (so 'load'/'idle' never
// fire). Serve a transparent tile for gaps instead.
const EMPTY_TILE = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0)
);

let registered = false;

/** Idempotently register the pmtiles:// protocol with gap handling. */
export function ensurePmtilesProtocol() {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol('pmtiles', async (params, abortController) => {
    const result = await protocol.tile(params, abortController);
    if (params.type !== 'json' && (!result || result.data === null)) {
      return { data: EMPTY_TILE };
    }
    return result;
  });
}
