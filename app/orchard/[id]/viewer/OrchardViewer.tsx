'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { OrchardConfig, ClientTree, TreeStatus } from '@/lib/types';
import { TREE_STATUSES } from '@/lib/types';
import { buildMapStyle } from '@/lib/map-style';
import { ensurePmtilesProtocol } from '@/lib/pmtiles-protocol';
import { toast } from 'sonner';
import { normalizeRowId } from '@/lib/row-id';
import BulkTreeImport from '../components/BulkTreeImport';
import { useTrees } from './useTrees';
import { useTreeLayer } from './useTreeLayer';
import { useTreeSelection, useMapUrlState, parseMapHash } from './useUrlState';
import TreeDetailPanel from './TreeDetailPanel';
import EditModePanel from './EditModePanel';
import MapLegend from './MapLegend';
import OrchardSwitcher from './OrchardSwitcher';

export interface OrchardViewerProps {
  orchard: OrchardConfig;
  allOrchards: OrchardConfig[];
  initialTrees: ClientTree[];
  canEdit: boolean;
}

export default function OrchardViewer({
  orchard,
  allOrchards,
  initialTrees,
  canEdit,
}: OrchardViewerProps) {
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // The loaded map as state so hooks can consume it during render
  const [mapObj, setMapObj] = useState<maplibregl.Map | null>(null);
  const mapReady = mapObj !== null;

  const showToast = useCallback(
    (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
      toast[type](message);
    },
    []
  );

  // Trees: server-seeded, optimistic CRUD
  const { trees, byId, refresh, create, update, move, remove } = useTrees(
    initialTrees,
    orchard.id,
    showToast
  );

  // Selection (?tree=) and camera (#map=) URL state
  const { selectedTreeId, select, clear } = useTreeSelection();
  const selectedTree = selectedTreeId ? (byId.get(selectedTreeId) ?? null) : null;
  const [saving, setSaving] = useState(false);

  // Edit ("marking") mode
  const [editMode, setEditMode] = useState(false);
  const [row, setRowState] = useState('');
  const [position, setPosition] = useState(1);
  const [autoIncrement, setAutoIncrement] = useState(true);
  const [placeVariety, setPlaceVariety] = useState('');
  const [placeStatus, setPlaceStatus] = useState<TreeStatus>('healthy');
  const [placedCount, setPlacedCount] = useState(0);
  const [lastPlacedId, setLastPlacedId] = useState<string | null>(null);

  // Rows that already exist (normalized, numerically sorted first)
  const existingRows = useMemo(() => {
    const rows = new Set<string>();
    for (const t of trees) if (t.row_id) rows.add(normalizeRowId(t.row_id));
    return [...rows].sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [trees]);

  // Next open position in a row = max existing position + 1
  const nextPositionForRow = useCallback(
    (rowId: string): number => {
      const norm = normalizeRowId(rowId);
      let max = 0;
      for (const t of trees) {
        if (t.row_id && normalizeRowId(t.row_id) === norm && t.position != null) {
          max = Math.max(max, t.position);
        }
      }
      return max + 1;
    },
    [trees]
  );

  // Changing the row jumps position to that row's next open slot
  const setRow = useCallback(
    (value: string) => {
      setRowState(value);
      if (value.trim()) setPosition(nextPositionForRow(value));
    },
    [nextPositionForRow]
  );

  const handleNextRow = useCallback(() => {
    const current = parseInt(normalizeRowId(row), 10);
    const next = Number.isNaN(current) ? '' : String(current + 1);
    setRowState(next);
    setPosition(next ? nextPositionForRow(next) : 1);
  }, [row, nextPositionForRow]);

  // Status filter via legend chips
  const [activeStatuses, setActiveStatuses] = useState<Set<TreeStatus>>(
    () => new Set(TREE_STATUSES)
  );
  const statusCounts = useMemo(() => {
    const counts = { healthy: 0, stressed: 0, dead: 0, unknown: 0 } as Record<TreeStatus, number>;
    for (const t of trees) counts[t.status] += 1;
    return counts;
  }, [trees]);
  const toggleStatus = useCallback((status: TreeStatus) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  // ---- map lifecycle ----
  useEffect(() => {
    if (!mapContainer.current) return;
    ensurePmtilesProtocol();

    // Camera precedence: ?tree= (handled after load) > #map= > orchard defaults
    const hashCamera = parseMapHash(window.location.hash);
    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: buildMapStyle(orchard, window.location.origin),
      center: hashCamera ? [hashCamera.lng, hashCamera.lat] : orchard.center,
      zoom: hashCamera ? hashCamera.zoom : orchard.defaultZoom,
      maxZoom: orchard.maxZoom,
      minZoom: orchard.minZoom,
      pitch: 0,
      bearing: 0,
    });

    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    m.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right'
    );
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');

    if (process.env.NODE_ENV === 'development') {
      m.on('error', (e) => console.error('Map error:', e.error?.message || e));
    }

    m.on('load', () => setMapObj(m));
    mapRef.current = m;
    if (process.env.NODE_ENV === 'development') {
      (window as unknown as { __map?: maplibregl.Map }).__map = m;
    }

    return () => {
      setMapObj(null);
      mapRef.current = null;
      m.remove();
    };
  }, [orchard]);

  // Deep link: fly to the selected tree once, when arriving with ?tree=
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (!mapObj || deepLinkedRef.current) return;
    deepLinkedRef.current = true;
    if (selectedTree?.lat != null && selectedTree?.lng != null) {
      mapObj.flyTo({
        center: [selectedTree.lng, selectedTree.lat],
        zoom: Math.max(mapObj.getZoom(), orchard.defaultZoom),
      });
    }
  }, [mapObj, selectedTree, orchard.defaultZoom]);

  useMapUrlState(mapObj, mapReady);

  // ---- tree layer ----
  const handleMove = useCallback(
    async (treeId: string, lng: number, lat: number) => {
      const ok = await move(treeId, lng, lat);
      if (ok) showToast('success', 'Tree position updated');
    },
    [move, showToast]
  );

  useTreeLayer(mapObj, mapReady, trees, {
    editMode,
    canEdit,
    statusFilter: activeStatuses.size === TREE_STATUSES.length ? null : activeStatuses,
    selectedTreeId,
    onSelect: select,
    onMove: handleMove,
  });

  // ---- edit-mode placement clicks ----
  const placementRef = useRef({
    editMode, canEdit, row, position, autoIncrement,
    placeVariety, placeStatus,
  });
  useEffect(() => {
    placementRef.current = {
      editMode, canEdit, row, position, autoIncrement,
      placeVariety, placeStatus,
    };
  });
  useEffect(() => {
    const m = mapObj;
    if (!m) return;

    const onClick = async (e: maplibregl.MapMouseEvent) => {
      const p = placementRef.current;
      if (!p.editMode || !p.canEdit) return;
      // Clicking an existing tree/cluster selects it instead of placing
      const layers = ['trees-circles', 'trees-clusters'].filter((l) => m.getLayer(l));
      if (layers.length && m.queryRenderedFeatures(e.point, { layers }).length > 0) return;
      if (!p.row || !p.position) {
        showToast('warning', 'Enter a row and position before placing a tree');
        return;
      }
      const tree = await create({
        row_id: p.row,
        position: p.position,
        lat: e.lngLat.lat,
        lng: e.lngLat.lng,
        status: p.placeStatus,
        variety: p.placeVariety.trim() || undefined,
      });
      if (tree) {
        if (p.autoIncrement) setPosition((prev) => prev + 1);
        setPlacedCount((n) => n + 1);
        setLastPlacedId(tree.tree_id);
        toast.success(`Placed ${tree.tree_id}`, {
          action: {
            label: 'Undo',
            onClick: () => {
              remove(tree.tree_id);
              setLastPlacedId((id) => (id === tree.tree_id ? null : id));
              setPlacedCount((n) => Math.max(0, n - 1));
              setPosition(p.position);
            },
          },
        });
      }
    };

    m.on('click', onClick);
    return () => {
      m.off('click', onClick);
    };
  }, [mapObj, create, remove, showToast]);

  // ---- keyboard: scoped to the viewer, single Escape owner ----
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') {
        if (selectedTreeId) clear();
        else if (editMode) setEditMode(false);
      } else if (e.key === 'e' && canEdit) {
        setEditMode((v) => !v);
      }
    },
    [selectedTreeId, clear, editMode, canEdit]
  );

  // ---- panel actions ----
  const handleSave = useCallback(
    async (patch: Parameters<typeof update>[1]) => {
      if (!selectedTreeId) return false;
      setSaving(true);
      try {
        const ok = await update(selectedTreeId, patch);
        if (ok) showToast('success', 'Tree updated');
        return ok;
      } finally {
        setSaving(false);
      }
    },
    [selectedTreeId, update, showToast]
  );

  const handleUndoLast = useCallback(async () => {
    if (!lastPlacedId) return;
    const undone = byId.get(lastPlacedId);
    const ok = await remove(lastPlacedId);
    if (ok) {
      setLastPlacedId(null);
      setPlacedCount((n) => Math.max(0, n - 1));
      // reopen the freed slot
      if (undone?.position != null) setPosition(undone.position);
    }
  }, [lastPlacedId, byId, remove]);

  const handleDelete = useCallback(async () => {
    if (!selectedTreeId) return false;
    setSaving(true);
    try {
      const ok = await remove(selectedTreeId);
      if (ok) clear();
      return ok;
    } finally {
      setSaving(false);
    }
  }, [selectedTreeId, remove, clear]);

  return (
    <div
      className="h-dvh w-full relative overflow-hidden [touch-action:pan-x_pan-y] [overscroll-behavior:none]"
      onKeyDown={onKeyDown}
    >
      <div
        ref={mapContainer}
        className={`h-full w-full bg-line ${
          editMode ? 'cursor-crosshair ring-4 ring-flag-600 ring-inset' : ''
        }`}
      />

      {/* Home button */}
      <button
        onClick={() => router.push('/')}
        aria-label="All orchards"
        className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-10 bg-surface rounded-lg shadow-lg p-2.5 hover:bg-canopy-50"
      >
        <svg aria-hidden className="w-5 h-5 text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </button>

      {/* Orchard header */}
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 bg-surface/95 backdrop-blur-sm rounded-lg shadow-lg px-4 py-2 z-10 max-w-[calc(100vw-9rem)]">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-ink truncate">{orchard.name}</h1>
            <p className="text-xs text-bark truncate">{orchard.location}</p>
          </div>
          <OrchardSwitcher orchards={allOrchards} currentId={orchard.id} />
        </div>
      </div>

      {/* Legend / status filter */}
      <MapLegend counts={statusCounts} active={activeStatuses} onToggle={toggleStatus} />

      {/* Empty state */}
      {trees.length === 0 && !editMode && (
        <div className="absolute inset-x-0 bottom-28 z-10 flex justify-center pointer-events-none">
          <div className="bg-surface/95 rounded-xl shadow-lg px-5 py-4 text-center pointer-events-auto">
            <p className="text-sm font-medium text-ink">No trees mapped yet</p>
            <p className="text-xs text-bark mt-1">
              {canEdit
                ? 'Enter edit mode to place trees, or import a CSV.'
                : 'Sign in to start mapping trees.'}
            </p>
          </div>
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="absolute bottom-[max(2rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-10 flex gap-2">
        {canEdit && !editMode && (
          <BulkTreeImport orchardId={orchard.id} existingTrees={trees} onImportComplete={refresh} />
        )}
        {canEdit && (
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              editMode
                ? 'bg-flag-600 text-white hover:bg-flag-700'
                : 'bg-surface text-ink hover:bg-canopy-50'
            }`}
          >
            {editMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
          </button>
        )}
      </div>

      {/* Edit-mode placement panel */}
      {editMode && canEdit && (
        <EditModePanel
          orchardId={orchard.id}
          row={row}
          position={position}
          autoIncrement={autoIncrement}
          variety={placeVariety}
          status={placeStatus}
          existingRows={existingRows}
          placedCount={placedCount}
          canUndo={lastPlacedId !== null}
          onRowChange={setRow}
          onPositionChange={setPosition}
          onAutoIncrementChange={setAutoIncrement}
          onVarietyChange={setPlaceVariety}
          onStatusChange={setPlaceStatus}
          onNextRow={handleNextRow}
          onUndoLast={handleUndoLast}
          onExit={() => setEditMode(false)}
        />
      )}

      {/* Tree details */}
      {selectedTree && (
        <TreeDetailPanel
          tree={selectedTree}
          canEdit={canEdit}
          saving={saving}
          onClose={clear}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
