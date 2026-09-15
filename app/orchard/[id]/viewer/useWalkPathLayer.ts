import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import type { ClientTree } from '@/lib/types';

const SOURCE_ID = 'walk-path';
const CASING = 'walk-path-casing';
const LINE = 'walk-path-line';

/**
 * Draws a walk route as a dashed line through the trees, in order.
 * Sits under the tree circles so dots stay tappable (the start tree is
 * the map selection, which already gets the selected ring). Null hides it.
 */
export function useWalkPathLayer(
  map: maplibregl.Map | null,
  mapReady: boolean,
  path: ClientTree[] | null
) {
  useEffect(() => {
    if (!mapReady || !map) return;
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    const beforeId = map.getLayer('trees-clusters') ? 'trees-clusters' : undefined;
    map.addLayer(
      {
        id: CASING,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.85 },
      },
      beforeId
    );
    map.addLayer(
      {
        id: LINE,
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#D9481C',
          'line-width': 3,
          'line-dasharray': [2, 1.5],
        },
      },
      beforeId
    );

    return () => {
      if (!map.style) return;
      for (const id of [LINE, CASING]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map, mapReady]);

  useEffect(() => {
    if (!mapReady || !map) return;
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const coords = (path ?? [])
      .filter((t) => t.lat != null && t.lng != null)
      .map((t) => [t.lng as number, t.lat as number]);
    source.setData(
      coords.length > 1
        ? {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coords },
          }
        : { type: 'FeatureCollection', features: [] }
    );
  }, [map, mapReady, path]);
}
