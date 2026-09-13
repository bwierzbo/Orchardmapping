'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { OrchardArea } from '@/lib/api/areas';

const SOURCE_ID = 'orchard-areas';
export const AREA_FILL = 'areas-fill';
const AREA_LINE = 'areas-line';
const AREA_LABEL = 'areas-label';

/** Default fill per kind; an explicit area.color wins. */
export const AREA_KIND_COLORS: Record<string, string> = {
  garden: '#6FA83F',
  berries: '#8E4B9E',
  block: '#4A7B9D',
  building: '#8A8578',
  area: '#3E7A57',
};

function toFeatureCollection(areas: OrchardArea[], hideId: number | null): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: areas
      .filter((a) => a.id !== hideId) // the one being edited renders as a draft instead
      .map((a) => ({
        type: 'Feature' as const,
        id: a.id,
        geometry: a.polygon,
        properties: {
          area_id: a.id,
          name: a.name,
          color: a.color || AREA_KIND_COLORS[a.kind] || AREA_KIND_COLORS.area,
        },
      })),
  };
}

/**
 * Committed area features (garden beds, berry fields, …): fill +
 * outline + centered name label, drawn beneath the tree layers.
 * Clicks are claimed only while area mode is active.
 */
export function useAreaLayer(
  map: maplibregl.Map | null,
  mapReady: boolean,
  areas: OrchardArea[],
  options: {
    /** Area currently being edited — hidden here, drawn as draft. */
    editingId: number | null;
    areaMode: boolean;
    onSelect: (areaId: number) => void;
  }
) {
  const { editingId, areaMode, onSelect } = options;
  const stateRef = useRef({ areaMode, onSelect });
  useEffect(() => {
    stateRef.current = { areaMode, onSelect };
  });

  useEffect(() => {
    if (!mapReady || !map) return;
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    // Under the tree layers so dots and clusters stay interactive
    const beforeId = map.getLayer('trees-circles') ? 'trees-circles' : undefined;
    map.addLayer(
      {
        id: AREA_FILL,
        type: 'fill',
        source: SOURCE_ID,
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.3 },
      },
      beforeId
    );
    map.addLayer(
      {
        id: AREA_LINE,
        type: 'line',
        source: SOURCE_ID,
        paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-opacity': 0.95 },
      },
      beforeId
    );
    map.addLayer(
      {
        id: AREA_LABEL,
        type: 'symbol',
        source: SOURCE_ID,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-font': ['Noto Sans Regular'],
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.55)',
          'text-halo-width': 1.2,
        },
      },
      beforeId
    );

    const onFillClick = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      if (!stateRef.current.areaMode) return;
      const f = e.features?.[0];
      if (f?.properties?.area_id != null) {
        stateRef.current.onSelect(Number(f.properties.area_id));
      }
    };
    map.on('click', AREA_FILL, onFillClick);

    return () => {
      map.off('click', AREA_FILL, onFillClick);
      if (!map.style) return;
      for (const id of [AREA_LABEL, AREA_LINE, AREA_FILL]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map, mapReady]);

  useEffect(() => {
    if (!mapReady || !map) return;
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(areas, editingId));
  }, [map, mapReady, areas, editingId]);
}
