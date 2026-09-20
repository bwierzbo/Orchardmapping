'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { TrapRow } from '@/lib/api/traps';
import type { TrapType } from '@/lib/traps';

const SOURCE_ID = 'traps';
export const TRAP_CIRCLES = 'traps-circles';
const TRAP_LABELS = 'traps-labels';

/**
 * Trap colours are deliberately NOT the tree status palette. A trap is a
 * different kind of object from a tree, and reusing healthy-green or
 * dead-red on a sphere would read as a claim about the tree under it.
 */
export const TRAP_COLORS: Record<TrapType, string> = {
  red_sphere: '#C0392B',
  cm_pheromone: '#4A7B9D',
  leafroller_pheromone: '#8E4B9E',
  yellow_card: '#DB9E00',
};

function toFeatureCollection(traps: TrapRow[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: traps
      .filter((t) => t.lng != null && t.lat != null && !t.removedOn)
      .map((t) => ({
        type: 'Feature' as const,
        id: t.id,
        geometry: { type: 'Point' as const, coordinates: [t.lng!, t.lat!] },
        properties: {
          trap_id: t.id,
          label: t.label,
          color: TRAP_COLORS[t.trapType],
          // The number on the map is the last count read, because that
          // is the one a threshold is judged against.
          last: t.lastCount ?? null,
          caption: t.lastCount == null ? t.label : `${t.label} · ${t.lastCount}`,
        },
      })),
  };
}

/**
 * Traps on the map, above the trees.
 *
 * Position is the whole point for a perimeter trap: apple maggot flies
 * IN from wild hosts, so a sphere on the hawthorn side and one in the
 * middle answer different questions.
 *
 * Told apart from trees by size, a heavy white ring, their own palette
 * and an always-on label — a circle layer cannot draw another shape,
 * and a real marker glyph would mean loading a sprite image.
 */
export function useTrapLayer(
  map: maplibregl.Map | null,
  mapReady: boolean,
  traps: TrapRow[],
  options: {
    trapMode: boolean;
    selectedTrapId: number | null;
    onSelect: (trapId: number) => void;
  }
) {
  const { trapMode, selectedTrapId, onSelect } = options;
  const stateRef = useRef({ trapMode, onSelect });
  useEffect(() => {
    stateRef.current = { trapMode, onSelect };
  });

  useEffect(() => {
    if (!mapReady || !map) return;
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    map.addLayer({
      id: TRAP_CIRCLES,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 11, 8],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.95,
      },
    });

    map.addLayer({
      id: TRAP_LABELS,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'text-field': ['get', 'caption'],
        'text-size': 11,
        'text-font': ['Noto Sans Regular'],
        'text-offset': [0, 1.4],
        'text-anchor': 'top',
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(0,0,0,0.6)',
        'text-halo-width': 1.2,
      },
    });

    const onTrapClick = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      const f = e.features?.[0];
      if (f?.properties?.trap_id == null) return;
      // Claimed in both modes: a trap is always worth selecting, and
      // stopping propagation keeps trap mode from placing a second trap
      // on top of the one just clicked.
      e.originalEvent.stopPropagation();
      stateRef.current.onSelect(Number(f.properties.trap_id));
    };
    const enter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const leave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', TRAP_CIRCLES, onTrapClick);
    map.on('mouseenter', TRAP_CIRCLES, enter);
    map.on('mouseleave', TRAP_CIRCLES, leave);

    return () => {
      map.off('click', TRAP_CIRCLES, onTrapClick);
      map.off('mouseenter', TRAP_CIRCLES, enter);
      map.off('mouseleave', TRAP_CIRCLES, leave);
      if (!map.style) return;
      for (const id of [TRAP_LABELS, TRAP_CIRCLES]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map, mapReady]);

  useEffect(() => {
    if (!mapReady || !map) return;
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(traps));
  }, [map, mapReady, traps]);

  // Selection ring, via feature-state keyed on the numeric DB id.
  const lastSelected = useRef<number | null>(null);
  useEffect(() => {
    if (!mapReady || !map || !map.getSource(SOURCE_ID)) return;
    if (lastSelected.current != null) {
      map.setFeatureState({ source: SOURCE_ID, id: lastSelected.current }, { selected: false });
    }
    if (selectedTrapId != null) {
      map.setFeatureState({ source: SOURCE_ID, id: selectedTrapId }, { selected: true });
    }
    lastSelected.current = selectedTrapId;
  }, [map, mapReady, selectedTrapId, traps]);
}
