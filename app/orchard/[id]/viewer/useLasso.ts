'use client';

import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';

const DRAFT_SOURCE = 'lasso-draft';
const DRAFT_FILL = 'lasso-draft-fill';
const DRAFT_LINE = 'lasso-draft-line';

/** A freehand trace, as [lng, lat] pairs in the order they were drawn. */
export type Ring = [number, number][];

/**
 * Draw a freehand shape on the map with a finger or a mouse.
 *
 * Unlike the area and detection tools, which drop one vertex per tap,
 * this follows a continuous drag -- circling a group of trees is one
 * gesture, which is what makes it usable in the field with a thumb.
 *
 * Touch handling mirrors the tree-drag controller in useTreeLayer: a
 * single pointer only (a second finger cancels, so pinch-zoom still
 * works), preventDefault to keep the map from panning under the trace,
 * and a small movement threshold so a stray tap does not become a
 * one-pixel selection.
 */
export function useLasso(
  map: maplibregl.Map | null,
  mapReady: boolean,
  active: boolean,
  onComplete: (ring: Ring) => void
) {
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    if (!mapReady || !map) return;

    // The draft shape lives in its own source so it can be repainted per
    // frame without touching the tree layer.
    if (!map.getSource(DRAFT_SOURCE)) {
      map.addSource(DRAFT_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: DRAFT_FILL,
        type: 'fill',
        source: DRAFT_SOURCE,
        paint: { 'fill-color': '#D9481C', 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: DRAFT_LINE,
        type: 'line',
        source: DRAFT_SOURCE,
        paint: { 'line-color': '#D9481C', 'line-width': 2, 'line-dasharray': [2, 1] },
      });
    }

    return () => {
      for (const id of [DRAFT_FILL, DRAFT_LINE]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(DRAFT_SOURCE)) map.removeSource(DRAFT_SOURCE);
    };
  }, [map, mapReady]);

  useEffect(() => {
    if (!mapReady || !map) return;

    const source = () => map.getSource(DRAFT_SOURCE) as maplibregl.GeoJSONSource | undefined;
    const clear = () =>
      source()?.setData({ type: 'FeatureCollection', features: [] });

    if (!active) {
      clear();
      return;
    }

    const canvas = map.getCanvas();
    canvas.style.cursor = 'crosshair';

    let points: Ring = [];
    let drawing = false;

    const paint = () => {
      const src = source();
      if (!src) return;
      // Under three points there is no area yet, so show the trace as a line.
      src.setData(
        points.length < 3
          ? {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: points },
            }
          : {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Polygon', coordinates: [[...points, points[0]]] },
            }
      );
    };

    const begin = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      if ('points' in e && e.points.length !== 1) return;
      e.preventDefault(); // keep dragPan off this gesture
      drawing = true;
      points = [[e.lngLat.lng, e.lngLat.lat]];
      paint();
    };

    const extend = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      if (!drawing) return;
      if ('points' in e && e.points.length !== 1) {
        // A second finger means they meant to zoom, not to draw.
        drawing = false;
        points = [];
        clear();
        return;
      }
      e.preventDefault();
      points.push([e.lngLat.lng, e.lngLat.lat]);
      paint();
    };

    const finish = () => {
      if (!drawing) return;
      drawing = false;
      const ring = points;
      points = [];
      clear();
      // Fewer than three points is a tap, not a shape.
      if (ring.length >= 3) onCompleteRef.current(ring);
    };

    map.on('mousedown', begin);
    map.on('mousemove', extend);
    map.on('mouseup', finish);
    map.on('touchstart', begin);
    map.on('touchmove', extend);
    map.on('touchend', finish);
    map.on('touchcancel', finish);

    return () => {
      map.off('mousedown', begin);
      map.off('mousemove', extend);
      map.off('mouseup', finish);
      map.off('touchstart', begin);
      map.off('touchmove', extend);
      map.off('touchend', finish);
      map.off('touchcancel', finish);
      canvas.style.cursor = '';
      clear();
    };
  }, [map, mapReady, active]);
}
