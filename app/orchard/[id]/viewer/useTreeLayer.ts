import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { ClientTree, TreeStatus } from '@/lib/types';
import { treesToFeatureCollection, STATUS_COLORS } from '@/lib/trees-geojson';
import { STATUS_LABEL } from '@/components/StatusBadge';

/** Build the hover-tooltip HTML for a tree feature (values are our own data). */
function treeTipHtml(p: { tree_id: string; variety: string; row_id: string; position: number; status: string }) {
  const status = (p.status in STATUS_LABEL ? p.status : 'unknown') as TreeStatus;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `
    <div class="tree-tip-title">${esc(p.variety || 'Unknown variety')}</div>
    <div class="tree-tip-meta">R${esc(p.row_id)} · P${p.position}
      <span class="tree-tip-dot" style="background:${STATUS_COLORS[status]}"></span>${STATUS_LABEL[status]}
    </div>`;
}

const SOURCE_ID = 'trees';
const CIRCLES = 'trees-circles';
const CLUSTERS = 'trees-clusters';
const CLUSTER_COUNT = 'trees-cluster-count';

export interface TreeLayerCallbacks {
  onSelect: (treeId: string) => void;
  onMove: (treeId: string, lng: number, lat: number) => void;
}

/** Walk-survey progress by tree_id: assessed trees fade, remaining ones get a dark ring. */
export interface WalkProgressSets {
  done: ReadonlySet<string>;
  todo: ReadonlySet<string>;
}

interface Options extends TreeLayerCallbacks {
  editMode: boolean;
  canEdit: boolean;
  statusFilter: ReadonlySet<TreeStatus> | null;
  selectedTreeId: string | null;
  /** Trees picked out with the lasso, painted as a group. */
  multiSelected?: ReadonlySet<string> | null;
  walkProgress?: WalkProgressSets | null;
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
  const walkProgress = options.walkProgress ?? null;
  const multiSelected = options.multiSelected ?? null;

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
          ['boolean', ['feature-state', 'picked'], false], 9,
          ['boolean', ['feature-state', 'hover'], false], 9,
          7,
        ],
        // feature-state.walk: 'done' (assessed on this walk) fades the
        // dot; 'todo' (still to visit) gets a dark ring. Unset = normal.
        'circle-opacity': [
          'case',
          ['boolean', ['feature-state', 'dragging'], false], 0.15,
          ['==', ['coalesce', ['feature-state', 'walk'], ''], 'done'], 0.35,
          1,
        ],
        'circle-stroke-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], '#D9481C',
          ['boolean', ['feature-state', 'picked'], false], '#D9481C',
          ['==', ['coalesce', ['feature-state', 'walk'], ''], 'todo'], '#14211A',
          ['==', ['coalesce', ['feature-state', 'walk'], ''], 'done'], '#2F6B3F',
          '#ffffff',
        ],
        'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 3,
          ['boolean', ['feature-state', 'picked'], false], 3,
          ['==', ['coalesce', ['feature-state', 'walk'], ''], 'todo'], 2.5,
          2,
        ],
        'circle-stroke-opacity': [
          'case',
          ['==', ['coalesce', ['feature-state', 'walk'], ''], 'done'], 0.5,
          1,
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

    // Hover tooltip — quick identification without a click. Pointer devices
    // only: on touch there is no hover, tap goes straight to the panel.
    const hoverCapable =
      typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;
    const tip = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'tree-tip',
      offset: 14,
      maxWidth: '240px',
    });

    const onMouseMove = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = 'pointer';
      if (typeof f.id === 'number' && f.id !== hoveredIdRef.current) setHover(f.id);
      if (hoverCapable) {
        tip
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(treeTipHtml(f.properties as Parameters<typeof treeTipHtml>[0]))
          .addTo(map);
      }
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
      setHover(null);
      tip.remove();
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

    // --- drag controller (edit mode): ghost the circle, one temp marker.
    // Works for mouse AND touch — a touch-drag on a dot moves the tree
    // (grab threshold is larger on touch so a jittery tap still selects).
    let dragTreeId: string | null = null;
    let dragFeatureId: number | null = null;
    let dragMarker: maplibregl.Marker | null = null;
    let dragStartPoint: { x: number; y: number } | null = null;
    let dragThreshold = 3;
    let dragging = false;
    let lastLngLat: maplibregl.LngLat | null = null;

    const beginDrag = (
      e: (maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
      threshold: number
    ) => {
      const { editMode: em, canEdit: ce } = stateRef.current;
      if (!em || !ce) return;
      const f = e.features?.[0];
      if (!f || typeof f.id !== 'number') return;
      e.preventDefault(); // keep dragPan off this gesture
      dragTreeId = String(f.properties.tree_id);
      dragFeatureId = f.id;
      dragStartPoint = { x: e.point.x, y: e.point.y };
      dragThreshold = threshold;
      dragging = false;
      lastLngLat = null;
    };

    const onCircleMouseDown = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => beginDrag(e, 3);

    const onCircleTouchStart = (
      e: maplibregl.MapTouchEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      if (e.points.length !== 1) return; // pinch = map gesture, not a drag
      beginDrag(e, 8);
    };

    const onPointerMove = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      if (dragTreeId === null || dragStartPoint === null) return;
      if ('points' in e && e.points.length > 1) {
        cancelDrag(); // second finger landed — treat as pinch, restore dot
        return;
      }
      if (!dragging) {
        const dx = e.point.x - dragStartPoint.x;
        const dy = e.point.y - dragStartPoint.y;
        if (Math.hypot(dx, dy) < dragThreshold) return;
        dragging = true;
        tip.remove(); // tooltip in the way of a drag
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
      lastLngLat = e.lngLat;
    };

    const resetDragState = () => {
      const featureId = dragFeatureId;
      dragTreeId = null;
      dragFeatureId = null;
      dragStartPoint = null;
      dragging = false;
      dragMarker?.remove();
      dragMarker = null;
      lastLngLat = null;
      if (featureId !== null) {
        map.setFeatureState({ source: SOURCE_ID, id: featureId }, { dragging: false });
      }
    };

    const cancelDrag = () => resetDragState();

    const endDrag = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      if (dragTreeId === null) return;
      const treeId = dragTreeId;
      const didDrag = dragging;
      const dropAt = lastLngLat ?? e.lngLat;
      resetDragState();
      if (didDrag && dropAt) {
        stateRef.current.onMove(treeId, dropAt.lng, dropAt.lat);
      }
      // A non-drag press+release on a circle falls through to onCircleClick
    };

    map.on('mousemove', CIRCLES, onMouseMove);
    map.on('mouseleave', CIRCLES, onMouseLeave);
    map.on('click', CIRCLES, onCircleClick);
    map.on('click', CLUSTERS, onClusterClick);
    map.on('mousedown', CIRCLES, onCircleMouseDown);
    map.on('mousemove', onPointerMove);
    map.on('mouseup', endDrag);
    map.on('touchstart', CIRCLES, onCircleTouchStart);
    map.on('touchmove', onPointerMove);
    map.on('touchend', endDrag);
    map.on('touchcancel', cancelDrag);

    return () => {
      map.off('mousemove', CIRCLES, onMouseMove);
      map.off('mouseleave', CIRCLES, onMouseLeave);
      map.off('click', CIRCLES, onCircleClick);
      map.off('click', CLUSTERS, onClusterClick);
      map.off('mousedown', CIRCLES, onCircleMouseDown);
      map.off('mousemove', onPointerMove);
      map.off('mouseup', endDrag);
      map.off('touchstart', CIRCLES, onCircleTouchStart);
      map.off('touchmove', onPointerMove);
      map.off('touchend', endDrag);
      map.off('touchcancel', cancelDrag);
      tip.remove();
      dragMarker?.remove();
      // On unmount the map-lifecycle cleanup (declared earlier) has
      // already run map.remove(), destroying map.style — touching
      // layers then throws. Removing the whole map removed them anyway.
      if (!map.style) return;
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

  // Lasso selection feature-state sync, same shape as walk progress
  // below: clear what was marked last time, then mark the current set.
  const pickedMarkedRef = useRef<number[]>([]);
  useEffect(() => {
    if (!mapReady || !map || !map.getSource(SOURCE_ID)) return;
    for (const id of pickedMarkedRef.current) {
      map.setFeatureState({ source: SOURCE_ID, id }, { picked: false });
    }
    pickedMarkedRef.current = [];
    if (!multiSelected || multiSelected.size === 0) return;
    for (const t of trees) {
      if (!multiSelected.has(t.tree_id)) continue;
      map.setFeatureState({ source: SOURCE_ID, id: t.id }, { picked: true });
      pickedMarkedRef.current.push(t.id);
    }
  }, [map, mapReady, multiSelected, trees]);

  // Walk-progress feature-state sync: clear what was marked last time,
  // then mark the current done/todo sets. setData() keeps feature-state,
  // so this only needs to run when the sets (or the id map) change.
  const walkMarkedRef = useRef<number[]>([]);
  useEffect(() => {
    if (!mapReady || !map || !map.getSource(SOURCE_ID)) return;
    for (const id of walkMarkedRef.current) {
      map.setFeatureState({ source: SOURCE_ID, id }, { walk: null });
    }
    walkMarkedRef.current = [];
    if (!walkProgress) return;
    for (const t of trees) {
      const state = walkProgress.done.has(t.tree_id)
        ? 'done'
        : walkProgress.todo.has(t.tree_id)
          ? 'todo'
          : null;
      if (!state) continue;
      map.setFeatureState({ source: SOURCE_ID, id: t.id }, { walk: state });
      walkMarkedRef.current.push(t.id);
    }
  }, [map, mapReady, walkProgress, trees]);
}
