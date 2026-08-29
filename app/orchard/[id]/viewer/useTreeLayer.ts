import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { ClientTree, TreeStatus } from '@/lib/types';
import { treesToFeatureCollection, STATUS_COLORS } from '@/lib/trees-geojson';

const SOURCE_ID = 'trees';
const CIRCLES = 'trees-circles';
const CLUSTERS = 'trees-clusters';
const CLUSTER_COUNT = 'trees-cluster-count';

export interface TreeLayerCallbacks {
  onSelect: (treeId: string) => void;
  onMove: (treeId: string, lng: number, lat: number) => void;
}

interface Options extends TreeLayerCallbacks {
  editMode: boolean;
  canEdit: boolean;
  statusFilter: ReadonlySet<TreeStatus> | null;
  selectedTreeId: string | null;
}

/**
 * Renders trees as a GeoJSON source + GPU circle layers with
 * feature-state driven hover/selection, cluster support, and a
 * pointer-drag controller for edit mode. Replaces per-tree DOM markers.
 */
export function useTreeLayer(
  map: maplibregl.Map | null,
  mapReady: boolean,
  trees: ClientTree[],
  options: Options
) {
  const { editMode, canEdit, statusFilter, selectedTreeId, onSelect, onMove } = options;

  // Refs so map handlers see fresh values without re-binding
  const stateRef = useRef({ editMode, canEdit, trees, onSelect, onMove });
  useEffect(() => {
    stateRef.current = { editMode, canEdit, trees, onSelect, onMove };
  });

  const hoveredIdRef = useRef<number | null>(null);
  const selectedNumericRef = useRef<number | null>(null);

  // Source + layers + event bindings (once per map instance)
  useEffect(() => {
    if (!mapReady || !map) return;

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterMaxZoom: 15,
      clusterRadius: 40,
    });

    map.addLayer({
      id: CLUSTERS,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#2F6B3F',
        'circle-radius': ['step', ['get', 'point_count'], 14, 25, 18, 100, 24],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });

    map.addLayer({
      id: CLUSTER_COUNT,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
      },
      paint: { 'text-color': '#ffffff' },
    });

    map.addLayer({
      id: CIRCLES,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': [
          'match',
          ['get', 'status'],
          'healthy', STATUS_COLORS.healthy,
          'stressed', STATUS_COLORS.stressed,
          'dead', STATUS_COLORS.dead,
          STATUS_COLORS.unknown,
        ],
        'circle-radius': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 10,
          ['boolean', ['feature-state', 'hover'], false], 9,
          7,
        ],
        'circle-opacity': [
          'case',
          ['boolean', ['feature-state', 'dragging'], false], 0.15,
          1,
        ],
        'circle-stroke-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], '#D9481C',
          '#ffffff',
        ],
        'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 3,
          2,
        ],
      },
    });

    const setHover = (id: number | null) => {
      if (hoveredIdRef.current !== null) {
        map.setFeatureState({ source: SOURCE_ID, id: hoveredIdRef.current }, { hover: false });
      }
      hoveredIdRef.current = id;
      if (id !== null) {
        map.setFeatureState({ source: SOURCE_ID, id }, { hover: true });
      }
    };

    const onMouseMove = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = 'pointer';
      if (typeof f.id === 'number' && f.id !== hoveredIdRef.current) setHover(f.id);
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
      setHover(null);
    };

    const onCircleClick = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      const f = e.features?.[0];
      if (!f) return;
      // Placement handler on the bare map also fires; it checks
      // queryRenderedFeatures so a tree click never places a duplicate.
      stateRef.current.onSelect(String(f.properties.tree_id));
    };

    const onClusterClick = async (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      const f = e.features?.[0];
      if (!f || typeof f.id !== 'number') return;
      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(f.id);
      map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
    };

    // --- drag controller (edit mode): ghost the circle, one temp marker ---
    let dragTreeId: string | null = null;
    let dragFeatureId: number | null = null;
    let dragMarker: maplibregl.Marker | null = null;
    let dragStartPoint: { x: number; y: number } | null = null;
    let dragging = false;

    const onCircleMouseDown = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      const { editMode: em, canEdit: ce } = stateRef.current;
      if (!em || !ce) return;
      const f = e.features?.[0];
      if (!f || typeof f.id !== 'number') return;
      e.preventDefault(); // keep dragPan off this gesture
      dragTreeId = String(f.properties.tree_id);
      dragFeatureId = f.id;
      dragStartPoint = { x: e.point.x, y: e.point.y };
      dragging = false;
    };

    const onMapMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (dragTreeId === null || dragStartPoint === null) return;
      if (!dragging) {
        const dx = e.point.x - dragStartPoint.x;
        const dy = e.point.y - dragStartPoint.y;
        if (Math.hypot(dx, dy) < 3) return;
        dragging = true;
        if (dragFeatureId !== null) {
          map.setFeatureState({ source: SOURCE_ID, id: dragFeatureId }, { dragging: true });
        }
        const el = document.createElement('div');
        el.style.cssText =
          'width:18px;height:18px;border-radius:50%;background:#D9481C;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);';
        dragMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(e.lngLat)
          .addTo(map);
      } else {
        dragMarker?.setLngLat(e.lngLat);
      }
    };

    const endDrag = (e: maplibregl.MapMouseEvent) => {
      if (dragTreeId === null) return;
      const treeId = dragTreeId;
      const featureId = dragFeatureId;
      const didDrag = dragging;
      dragTreeId = null;
      dragFeatureId = null;
      dragStartPoint = null;
      dragging = false;
      dragMarker?.remove();
      dragMarker = null;
      if (featureId !== null) {
        map.setFeatureState({ source: SOURCE_ID, id: featureId }, { dragging: false });
      }
      if (didDrag) {
        stateRef.current.onMove(treeId, e.lngLat.lng, e.lngLat.lat);
      }
      // A non-drag mousedown+up on a circle falls through to onCircleClick
    };

    map.on('mousemove', CIRCLES, onMouseMove);
    map.on('mouseleave', CIRCLES, onMouseLeave);
    map.on('click', CIRCLES, onCircleClick);
    map.on('click', CLUSTERS, onClusterClick);
    map.on('mousedown', CIRCLES, onCircleMouseDown);
    map.on('mousemove', onMapMouseMove);
    map.on('mouseup', endDrag);

    return () => {
      map.off('mousemove', CIRCLES, onMouseMove);
      map.off('mouseleave', CIRCLES, onMouseLeave);
      map.off('click', CIRCLES, onCircleClick);
      map.off('click', CLUSTERS, onClusterClick);
      map.off('mousedown', CIRCLES, onCircleMouseDown);
      map.off('mousemove', onMapMouseMove);
      map.off('mouseup', endDrag);
      dragMarker?.remove();
      if (map.getLayer(CLUSTER_COUNT)) map.removeLayer(CLUSTER_COUNT);
      if (map.getLayer(CLUSTERS)) map.removeLayer(CLUSTERS);
      if (map.getLayer(CIRCLES)) map.removeLayer(CIRCLES);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map, mapReady]);

  // Data sync: optimistic CRUD repaints via setData, no teardown
  useEffect(() => {
    if (!mapReady || !map) return;
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(treesToFeatureCollection(trees, statusFilter ?? undefined));
  }, [map, mapReady, trees, statusFilter]);

  // Selection feature-state sync
  useEffect(() => {
    if (!mapReady || !map || !map.getSource(SOURCE_ID)) return;
    if (selectedNumericRef.current !== null) {
      map.setFeatureState(
        { source: SOURCE_ID, id: selectedNumericRef.current },
        { selected: false }
      );
      selectedNumericRef.current = null;
    }
    if (selectedTreeId) {
      const tree = trees.find((t) => t.tree_id === selectedTreeId);
      if (tree) {
        map.setFeatureState({ source: SOURCE_ID, id: tree.id }, { selected: true });
        selectedNumericRef.current = tree.id;
      }
    }
  }, [map, mapReady, selectedTreeId, trees]);
}
