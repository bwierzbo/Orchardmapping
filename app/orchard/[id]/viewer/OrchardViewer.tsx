'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart3, CalendarRange, Eye } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { OrchardConfig, ClientTree, TreeStatus } from '@/lib/types';
import { TREE_STATUSES } from '@/lib/types';
import { buildMapStyle } from '@/lib/map-style';
import { STATUS_COLORS } from '@/lib/trees-geojson';
import { STATUS_LABEL } from '@/components/StatusBadge';
import { ensurePmtilesProtocol } from '@/lib/pmtiles-protocol';
import { toast } from 'sonner';
import { normalizeRowId } from '@/lib/address';
import { comparePositions, nextPosition } from '@/lib/position';
import BulkTreeImport from '../components/BulkTreeImport';
import { useTrees } from './useTrees';
import { useTreeLayer } from './useTreeLayer';
import { useTreeSelection, useMapUrlState, parseMapHash } from './useUrlState';
import TreeDetailPanel from './TreeDetailPanel';
import WalkMode, { type WalkProgressView } from './WalkMode';
import { useWalkPathLayer } from './useWalkPathLayer';
import GroupActionDialog from '@/components/GroupActionDialog';
import {
  DEFAULT_WALK_SETTINGS,
  normalizeWalkSettings,
  type WalkSettings,
} from '@/lib/settings';
import EditModePanel from './EditModePanel';
import TreeGridEditor from './TreeGridEditor';
import { useLasso, type Ring } from './useLasso';
import { treesInRing, applyLasso, type LassoMode } from '@/lib/lasso';
import MapLegend, { type LegendChip } from './MapLegend';
import {
  bandFor,
  bandCounts,
  isDormant,
  BAND_STYLE,
  RECENCY_BANDS,
  GROWING_SEASON_BANDS,
  DORMANT_BANDS,
  type RecencyBand,
} from '@/lib/inspection-recency';
import OrchardSwitcher from './OrchardSwitcher';
import { useAreaLayer } from './useAreaLayer';
import { useTrapLayer } from './useTrapLayer';
import TrapModePanel from './TrapModePanel';
import TrapDetailPanel from './TrapDetailPanel';
import {
  fetchTraps,
  createTrap,
  recordTrapCount,
  retireTrap as apiRetireTrap,
  type TrapRow,
} from '@/lib/api/traps';
import { nextTrapLabel, type TrapType } from '@/lib/traps';
import { fetchScheduleSummary, type ScheduleSummary } from '@/lib/api/program';
import AreaTools from './AreaTools';
import PhotoDropController from './PhotoDropController';
import MoveTreeController from './MoveTreeController';
import DetectTreesController from './DetectTreesController';
import { fetchAreas, type OrchardArea } from '@/lib/api/areas';
import { trpc } from '@/lib/trpc/client';
import type { PickablePest } from '@/lib/pest-picker';

export interface OrchardViewerProps {
  orchard: OrchardConfig;
  allOrchards: OrchardConfig[];
  initialTrees: ClientTree[];
  canEdit: boolean;
  /** tree_id -> the day it was last looked at. Absent = never. */
  lastInspected: Record<string, string>;
  /** The region's dormant window, which sets how forgiving the bands are. */
  chillWindow: { start: string; end: string };
}

export default function OrchardViewer({
  orchard,
  allOrchards,
  initialTrees,
  canEdit,
  lastInspected: initialLastInspected,
  chillWindow,
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

  // Group actions (bulk event/field changes with undo)
  const [groupActionOpen, setGroupActionOpen] = useState(false);

  // Area features (garden beds, berry fields, …)
  const [areas, setAreas] = useState<OrchardArea[]>([]);
  const [areaMode, setAreaMode] = useState(false);
  const [trapMode, setTrapMode] = useState(false);
  const [traps, setTraps] = useState<TrapRow[]>([]);
  const [scheduleSummary, setScheduleSummary] = useState<ScheduleSummary | null>(null);
  const [selectedTrapId, setSelectedTrapId] = useState<number | null>(null);
  const [trapType, setTrapType] = useState<TrapType>('red_sphere');
  const [trapLabel, setTrapLabel] = useState('Sphere 1');
  const [trapsPlaced, setTrapsPlaced] = useState(0);
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(null);
  const [hiddenAreaIds, setHiddenAreaIds] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => {
    fetchAreas(orchard.id)
      .then(setAreas)
      .catch(() => {}); // map works without areas
  }, [orchard.id]);

  // Walk (survey) mode — one-tap-per-tree recording, pass-based decks
  const [walkMode, setWalkMode] = useState(false);
  const [walkSettings, setWalkSettings] = useState<WalkSettings>(DEFAULT_WALK_SETTINGS);
  const [photoSettings, setPhotoSettings] = useState<{ geotagOnMap: boolean }>({
    geotagOnMap: true,
  });
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((b) => {
        if (b?.walk) setWalkSettings(normalizeWalkSettings(b.walk));
        if (b?.photos) setPhotoSettings(b.photos);
      })
      .catch(() => {}); // defaults are fine offline
  }, []);
  // The map selection doubles as the walk's start tree while the setup
  // sheet is open, so tapping a tree there picks the starting point.
  const startWalk = useCallback(() => setWalkMode(true), []);
  const [walkPath, setWalkPath] = useState<ClientTree[] | null>(null);
  const [walkProgress, setWalkProgress] = useState<WalkProgressView | null>(null);
  const focusWalkTree = useCallback(
    (tree: ClientTree) => {
      select(tree.tree_id);
      if (mapObj && tree.lat != null && tree.lng != null) {
        mapObj.easeTo({
          center: [tree.lng, tree.lat],
          zoom: Math.max(mapObj.getZoom(), 19),
          duration: 350,
        });
      }
    },
    [select, mapObj]
  );
  const walkSetStatus = useCallback(
    (treeId: string, status: TreeStatus) => update(treeId, { status }),
    [update]
  );

  // "Move on map" flow from the tree panel — no Edit Mode required
  const [movingTree, setMovingTree] = useState<ClientTree | null>(null);

  // Auto-detect trees from imagery; boundary is state so an Areas-panel
  // save shows up here without a reload
  const [detectMode, setDetectMode] = useState(false);
  const [boundaryGeo, setBoundaryGeo] = useState(orchard.boundary ?? null);

  // Edit ("marking") mode
  const [editMode, setEditMode] = useState(false);

  // Lasso selection: circle a group of trees, then edit them together.
  const [lassoMode, setLassoMode] = useState<LassoMode | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [gridOpen, setGridOpen] = useState(false);

  const handleLasso = useCallback(
    (ring: Ring) => {
      const mode = lassoMode ?? 'replace';
      const hits = treesInRing(trees, ring);
      setPicked((prev) => applyLasso(prev, hits, mode));
      if (hits.length === 0 && mode === 'replace') {
        showToast('info', 'No trees inside that shape');
      }
      // One trace, one selection: drop back out so the map pans again.
      setLassoMode(null);
    },
    [trees, lassoMode, showToast]
  );

  const clearPicked = useCallback(() => {
    setPicked(new Set());
    setLassoMode(null);
  }, []);
  const [row, setRowState] = useState('');
  const [position, setPosition] = useState('1');
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

  // Next open position in a row: advance the row's highest label
  // ("12"→"13", "2N"→"3N"); "1" for an empty row, or the highest label
  // itself when it has no number to advance.
  const nextPositionForRow = useCallback(
    (rowId: string): string => {
      const norm = normalizeRowId(rowId);
      let max: string | null = null;
      for (const t of trees) {
        if (t.row_id && normalizeRowId(t.row_id) === norm && t.position) {
          if (max === null || comparePositions(t.position, max) > 0) max = t.position;
        }
      }
      if (max === null) return '1';
      return nextPosition(max) ?? max;
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
    setPosition(next ? nextPositionForRow(next) : '1');
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

    // Camera precedence: ?tree= (handled after load) > #map= > orchard defaults.
    // Boundary-only orchards get a viewport-aware fit below — the stored
    // default zoom was computed blind to screen size, and on a phone the
    // block fills the screen edge to edge (reads as a blank page).
    const hashCamera = parseMapHash(window.location.hash);
    const boundaryOnly = !!orchard.boundary && !orchard.orthoPmtilesPath && !orchard.orthoPath;
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

    if (!hashCamera && boundaryOnly) {
      m.fitBounds(
        [
          [orchard.bounds.minLng, orchard.bounds.minLat],
          [orchard.bounds.maxLng, orchard.bounds.maxLat],
        ],
        { padding: 48, animate: false }
      );
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

  useAreaLayer(mapObj, mapReady, areas, {
    editingId: areaMode ? selectedAreaId : null,
    areaMode,
    onSelect: setSelectedAreaId,
    hiddenIds: hiddenAreaIds,
  });

  useWalkPathLayer(mapObj, mapReady, walkMode ? walkPath : null);

  // ---- traps ----
  const season = useMemo(() => new Date().getFullYear(), []);
  const todayYmd = useMemo(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }, []);

  // ---- inspection recency ----
  //
  // A second way to read the same dots: not "how is this tree" but "when
  // did anyone last look at it". Worth having as its own mode because
  // status colouring cannot distinguish a tree that is genuinely fine
  // from one nobody has visited — both come out 'unknown' grey, and at
  // Finn Hall that was 475 trees out of 480.
  const [recencyMode, setRecencyMode] = useState(false);
  const [lastSeen, setLastSeen] = useState<Record<string, string>>(initialLastInspected);
  const [activeBands, setActiveBands] = useState<Set<RecencyBand>>(
    () => new Set(RECENCY_BANDS)
  );

  /** Record a fresh look locally, so the map moves the moment one is saved. */
  const markInspected = useCallback(
    (treeId: string) => setLastSeen((prev) => ({ ...prev, [treeId]: todayYmd })),
    [todayYmd]
  );

  const recencyBands = useMemo(
    () =>
      isDormant(todayYmd, chillWindow.start, chillWindow.end)
        ? DORMANT_BANDS
        : GROWING_SEASON_BANDS,
    [todayYmd, chillWindow.start, chillWindow.end]
  );

  const lastSeenMap = useMemo(() => new Map(Object.entries(lastSeen)), [lastSeen]);

  // A walk paints the same dots with its own done/todo channel, so the
  // two modes are mutually exclusive rather than stacked.
  const recencyActive = recencyMode && !walkMode;

  const recencyByTree = useMemo(() => {
    if (!recencyActive) return null;
    const m = new Map<string, RecencyBand>();
    for (const t of trees) {
      m.set(t.tree_id, bandFor(lastSeen[t.tree_id] ?? null, todayYmd, recencyBands));
    }
    return m;
  }, [recencyActive, trees, lastSeen, todayYmd, recencyBands]);

  const recencyCounts = useMemo(
    () => bandCounts(lastSeenMap, trees.map((t) => t.tree_id), todayYmd, recencyBands),
    [lastSeenMap, trees, todayYmd, recencyBands]
  );

  // Legend chips switched off hide their trees, which is what makes
  // "Never inspected" useful: tap it and the map becomes the to-do list.
  const hiddenIds = useMemo(() => {
    if (!recencyByTree || activeBands.size === RECENCY_BANDS.length) return null;
    const hidden = new Set<string>();
    for (const [treeId, band] of recencyByTree) {
      if (!activeBands.has(band)) hidden.add(treeId);
    }
    return hidden;
  }, [recencyByTree, activeBands]);
  const toggleBand = useCallback((band: RecencyBand) => {
    setActiveBands((prev) => {
      const next = new Set(prev);
      if (next.has(band)) next.delete(band);
      else next.add(band);
      return next;
    });
  }, []);

  /**
   * A walk already reports which trees it has assessed, for the map
   * styling. Recency rides on that rather than adding a second callback
   * down the same path.
   */
  const handleWalkProgress = useCallback(
    (progress: WalkProgressView | null) => {
      setWalkProgress(progress);
      if (!progress?.done.size) return;
      setLastSeen((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const treeId of progress.done) {
          if (next[treeId] === todayYmd) continue;
          next[treeId] = todayYmd;
          changed = true;
        }
        return changed ? next : prev;
      });
    },
    [todayYmd]
  );

  const legendChips = useMemo<LegendChip[]>(
    () =>
      recencyActive
        ? RECENCY_BANDS.map((band) => ({
            key: band,
            label: BAND_STYLE[band].label,
            count: recencyCounts[band],
            fill: BAND_STYLE[band].fill,
            ring: BAND_STYLE[band].ring === '#FFFFFF' ? undefined : BAND_STYLE[band].ring,
          }))
        : TREE_STATUSES.map((status) => ({
            key: status,
            label: STATUS_LABEL[status],
            count: statusCounts[status],
            fill: STATUS_COLORS[status],
          })),
    [recencyActive, recencyCounts, statusCounts]
  );

  const refreshTraps = useCallback(async () => {
    try {
      setTraps(await fetchTraps(orchard.id, season));
    } catch {
      // A trap-layer failure must never take the map down with it.
    }
  }, [orchard.id, season]);

  useEffect(() => {
    fetchTraps(orchard.id, season)
      .then(setTraps)
      .catch(() => {}); // map works without traps
  }, [orchard.id, season]);

  // ---- pest library ----
  //
  // Fetched once for the orchard. The inspection form remounts per tree
  // (key={tree_id}), so fetching it in there would hit the API at every
  // step of a walk.
  const [pestLibrary, setPestLibrary] = useState<{
    entries: PickablePest[];
    counts: Record<string, number>;
  }>({ entries: [], counts: {} });

  useEffect(() => {
    let live = true;
    trpc.pest.list
      .query({ orchardId: orchard.id })
      .then((r) => {
        if (live) setPestLibrary({ entries: r.entries, counts: r.counts });
      })
      .catch(() => {
        /* the form hides the section rather than showing an empty one */
      });
    return () => {
      live = false;
    };
  }, [orchard.id]);

  // Prevalence comes from the region. With none set, nothing ranks the
  // list, and the form says so rather than implying an order it has not
  // earned.
  const pestsRanked = useMemo(
    () => pestLibrary.entries.some((p) => p.prevalence !== null),
    [pestLibrary.entries]
  );

  useEffect(() => {
    fetchScheduleSummary(orchard.id)
      .then(setScheduleSummary)
      .catch(() => {}); // the chip is an extra, never a blocker
  }, [orchard.id]);

  useTrapLayer(mapObj, mapReady, traps, {
    trapMode,
    selectedTrapId,
    onSelect: (id) => {
      setSelectedTrapId(id);
      clear();
    },
  });

  const selectedTrap = useMemo(
    () => traps.find((t) => t.id === selectedTrapId) ?? null,
    [traps, selectedTrapId]
  );

  const trapCount = useCallback(
    async (count: number) => {
      if (!selectedTrapId) return;
      try {
        await recordTrapCount(orchard.id, selectedTrapId, todayYmd, count);
        await refreshTraps();
        showToast('success', count > 0 ? `${count} recorded` : 'Recorded — nothing on it');
      } catch (error) {
        showToast('error', error instanceof Error ? error.message : 'Could not record the count');
      }
    },
    [orchard.id, selectedTrapId, todayYmd, refreshTraps, showToast]
  );

  const trapRetire = useCallback(async () => {
    if (!selectedTrapId) return;
    try {
      await apiRetireTrap(selectedTrapId, todayYmd);
      setSelectedTrapId(null);
      await refreshTraps();
      showToast('success', 'Trap taken down');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Could not take it down');
    }
  }, [selectedTrapId, todayYmd, refreshTraps, showToast]);

  useLasso(mapObj, mapReady, lassoMode !== null, handleLasso);

  useTreeLayer(mapObj, mapReady, trees, {
    editMode,
    multiSelected: picked,
    canEdit,
    statusFilter: activeStatuses.size === TREE_STATUSES.length ? null : activeStatuses,
    selectedTreeId,
    walkProgress: walkMode ? walkProgress : null,
    recency: recencyByTree,
    hiddenIds,
    lastInspected: recencyActive ? lastSeenMap : null,
    onSelect: select,
    onMove: handleMove,
  });

  // ---- edit-mode placement clicks ----
  const placementRef = useRef({
    editMode, canEdit, row, position, autoIncrement,
    placeVariety, placeStatus, trapMode, trapType, trapLabel,
  });
  useEffect(() => {
    placementRef.current = {
      editMode, canEdit, row, position, autoIncrement,
      placeVariety, placeStatus, trapMode, trapType, trapLabel,
    };
  });
  useEffect(() => {
    const m = mapObj;
    if (!m) return;

    const onClick = async (e: maplibregl.MapMouseEvent) => {
      const p = placementRef.current;

      // Trap mode places traps; the trap layer claims clicks on an
      // existing trap before this runs, so a tap can't stack one on top
      // of another.
      if (p.trapMode && p.canEdit) {
        if (!p.trapLabel.trim()) {
          showToast('warning', 'Name the trap before hanging it');
          return;
        }
        try {
          await createTrap({
            orchardId: orchard.id,
            trapType: p.trapType,
            label: p.trapLabel.trim(),
            lng: e.lngLat.lng,
            lat: e.lngLat.lat,
            deployedOn: todayYmd,
          });
          setTrapsPlaced((n) => n + 1);
          setTrapLabel(nextTrapLabel);
          await refreshTraps();
        } catch (error) {
          showToast('error', error instanceof Error ? error.message : 'Could not hang the trap');
        }
        return;
      }

      if (!p.editMode || !p.canEdit) return;
      // Clicking an existing tree/cluster selects it instead of placing
      const layers = ['trees-circles', 'trees-clusters'].filter((l) => m.getLayer(l));
      if (layers.length && m.queryRenderedFeatures(e.point, { layers }).length > 0) return;
      if (!p.row.trim() || !p.position.trim()) {
        showToast('warning', 'Enter a row/block and position before placing a tree');
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
        if (p.autoIncrement) setPosition((prev) => nextPosition(prev) ?? prev);
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
  }, [mapObj, create, remove, showToast, orchard.id, todayYmd, refreshTraps]);

  // ---- keyboard: scoped to the viewer, single Escape owner ----
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') {
        // Back out of the lasso one step at a time: stop drawing first,
        // then drop the selection.
        if (lassoMode !== null) setLassoMode(null);
        else if (picked.size > 0) clearPicked();
        else if (selectedTreeId) clear();
        else if (detectMode) setDetectMode(false);
        else if (selectedTrapId) setSelectedTrapId(null);
        else if (trapMode) setTrapMode(false);
        else if (areaMode) {
          if (selectedAreaId !== null) setSelectedAreaId(null);
          else setAreaMode(false);
        } else if (editMode) setEditMode(false);
      } else if (e.key === 'e' && canEdit && !detectMode) {
        setAreaMode(false);
        setEditMode((v) => !v);
      }
    },
    [
      selectedTreeId, clear, editMode, canEdit, areaMode, selectedAreaId,
      detectMode, selectedTrapId, trapMode, lassoMode, picked, clearPicked,
    ]
  );

  // ---- panel actions ----

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
          editMode
            ? 'cursor-crosshair ring-4 ring-flag-600 ring-inset'
            : trapMode
              ? 'cursor-crosshair ring-4 ring-canopy-600 ring-inset'
              : ''
        }`}
      />

      {/*
        Left rail. Labelled, because the map used to hide the whole
        dashboard — and with it the program — behind an unlabelled chart
        icon, which is not something anyone finds by accident.
      */}
      <div className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex flex-col items-start gap-2">
        <button
          onClick={() => router.push('/')}
          aria-label="All orchards"
          className="bg-surface rounded-lg shadow-lg p-2.5 hover:bg-canopy-50"
        >
          <svg aria-hidden className="w-5 h-5 text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>

        <button
          onClick={() => router.push(`/orchard/${orchard.id}/dashboard`)}
          title="Orchard dashboard"
          className="inline-flex items-center gap-1.5 bg-surface rounded-lg shadow-lg px-2.5 py-2 text-sm font-medium text-ink hover:bg-canopy-50"
        >
          <BarChart3 aria-hidden size={18} />
          Dashboard
        </button>

        {/*
          Two readings of the same dots. Kept as a mode rather than a
          separate page so the switch is one tap while standing in the
          orchard, and so selection and the open panel survive it.
        */}
        {trees.length > 0 && !walkMode && !detectMode && (
          <button
            onClick={() => setRecencyMode((v) => !v)}
            aria-pressed={recencyMode}
            title={
              recencyMode
                ? 'Back to colouring by condition'
                : 'Colour by how long since anyone looked'
            }
            className={`inline-flex items-center gap-1.5 rounded-lg shadow-lg px-2.5 py-2 text-sm font-medium ${
              recencyMode
                ? 'bg-canopy-600 text-white hover:bg-canopy-700'
                : 'bg-surface text-ink hover:bg-canopy-50'
            }`}
          >
            <Eye aria-hidden size={18} />
            {recencyMode ? 'Last looked at' : 'Coverage'}
          </button>
        )}

        {/*
          What the program is asking for, on the map itself. Fetched
          after the tiles rather than blocking them, so it appears a
          moment late instead of holding up the map.
        */}
        {scheduleSummary && (
          <button
            onClick={() => router.push(`/orchard/${orchard.id}/program`)}
            title={
              scheduleSummary.leadTitle ??
              (scheduleSummary.due > 0 ? 'Steps are open' : 'The season programme')
            }
            className={`inline-flex items-center gap-1.5 rounded-lg shadow-lg px-2.5 py-2 text-sm font-medium max-w-[13rem] ${
              scheduleSummary.due > 0
                ? 'bg-flag-600 text-white hover:bg-flag-700'
                : 'bg-surface text-ink hover:bg-canopy-50'
            }`}
          >
            <CalendarRange aria-hidden size={18} className="shrink-0" />
            <span className="truncate">
              {scheduleSummary.due > 0
                ? scheduleSummary.leadTitle ?? `${scheduleSummary.due} due`
                : scheduleSummary.monitor > 0
                  ? `${scheduleSummary.monitor} watching`
                  : 'Program'}
            </span>
          </button>
        )}
      </div>

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

      {/* Legend / filter — condition by default, recency in the other mode */}
      <MapLegend
        chips={legendChips}
        active={recencyActive ? activeBands : activeStatuses}
        onToggle={
          recencyActive
            ? (key) => toggleBand(key as RecencyBand)
            : (key) => toggleStatus(key as TreeStatus)
        }
        caption={
          recencyActive
            ? `Days since anyone looked. ${
                isDormant(todayYmd, chillWindow.start, chillWindow.end)
                  ? 'Dormant season, so the bands are wider'
                  : 'Growing season, so the bands are tight'
              } — fresh within ${recencyBands.freshDays}d, stale past ${recencyBands.ageingDays}d.`
            : undefined
        }
      />

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
        {!canEdit && (
          <Link
            href={`/login?redirect_url=${encodeURIComponent(`/orchard/${orchard.id}`)}`}
            className="px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-surface text-ink hover:bg-canopy-50"
          >
            Sign in to edit
          </Link>
        )}
        {canEdit && !editMode && !detectMode && (
          <BulkTreeImport orchardId={orchard.id} existingTrees={trees} onImportComplete={refresh} />
        )}
        {canEdit && !editMode && !walkMode && !areaMode && !detectMode && (
          <PhotoDropController
            map={mapObj}
            trees={trees}
            targetTree={selectedTree}
            enabled={photoSettings.geotagOnMap}
          />
        )}
        {canEdit && !editMode && !walkMode && !areaMode && !detectMode && (
          <button
            onClick={() => setDetectMode(true)}
            className="px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-surface text-ink hover:bg-canopy-50"
          >
            Detect Trees
          </button>
        )}
        {canEdit && !editMode && !walkMode && !detectMode && trees.length > 0 && (
          <>
            <button
              onClick={startWalk}
              className="px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-canopy-600 text-white hover:bg-canopy-700"
            >
              Walk Survey
            </button>
            <button
              onClick={() => setLassoMode('replace')}
              className="px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-surface text-ink hover:bg-canopy-50"
            >
              Select Trees
            </button>
            <button
              onClick={() => setGroupActionOpen(true)}
              className="px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-surface text-ink hover:bg-canopy-50"
            >
              Group Action
            </button>
          </>
        )}
        {canEdit && !walkMode && !areaMode && !detectMode && !trapMode && (
          <button
            onClick={() => {
              setAreaMode(false);
              setEditMode((v) => !v);
            }}
            className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              editMode
                ? 'bg-flag-600 text-white hover:bg-flag-700'
                : 'bg-surface text-ink hover:bg-canopy-50'
            }`}
          >
            {editMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
          </button>
        )}
        {canEdit && !walkMode && !editMode && !areaMode && !detectMode && (
          <button
            onClick={() => {
              setSelectedTrapId(null);
              setTrapMode((v) => !v);
            }}
            className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              trapMode
                ? 'bg-canopy-600 text-white hover:bg-canopy-700'
                : 'bg-surface text-ink hover:bg-canopy-50'
            }`}
          >
            {trapMode ? 'Done Hanging' : 'Traps'}
          </button>
        )}
        {canEdit && !walkMode && !editMode && !detectMode && !trapMode && (
          <button
            onClick={() => {
              setEditMode(false);
              setSelectedAreaId(null);
              setAreaMode((v) => !v);
            }}
            className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
              areaMode
                ? 'bg-canopy-700 text-white hover:bg-canopy-800'
                : 'bg-surface text-ink hover:bg-canopy-50'
            }`}
          >
            {areaMode ? 'Done with Areas' : 'Areas'}
          </button>
        )}
      </div>

      {/* Area drawing / reshaping tools */}
      <AreaTools
        map={mapObj}
        mapReady={mapReady}
        orchardId={orchard.id}
        active={areaMode && canEdit}
        areas={areas}
        setAreas={setAreas}
        selectedId={selectedAreaId}
        setSelectedId={setSelectedAreaId}
        hiddenIds={hiddenAreaIds}
        setHiddenIds={setHiddenAreaIds}
        boundary={boundaryGeo}
        onBoundarySaved={setBoundaryGeo}
        onExit={() => {
          setSelectedAreaId(null);
          setAreaMode(false);
        }}
      />

      {/* Auto-detect trees from satellite imagery */}
      <DetectTreesController
        map={mapObj}
        mapReady={mapReady}
        orchardId={orchard.id}
        trees={trees}
        boundary={boundaryGeo}
        active={detectMode && canEdit}
        onSaved={refresh}
        onExit={() => setDetectMode(false)}
      />

      {/* Lasso: what to do, and what has been picked */}
      {lassoMode !== null && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg shadow-lg bg-ink/85 text-paper text-xs font-medium pointer-events-none">
          {lassoMode === 'replace'
            ? 'Draw a circle around the trees you want'
            : lassoMode === 'add'
              ? 'Draw around trees to add to the selection'
              : 'Draw around trees to take out of the selection'}
        </div>
      )}

      {picked.size > 0 && !gridOpen && (
        <div className="absolute bottom-[max(6.5rem,calc(env(safe-area-inset-bottom)+6.5rem))] left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2 py-1.5 rounded-lg shadow-lg bg-surface border border-line">
          <span className="px-2 text-sm font-medium text-ink whitespace-nowrap">
            {picked.size} {picked.size === 1 ? 'tree' : 'trees'}
          </span>
          <button
            onClick={() => setGridOpen(true)}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-canopy-600 text-white hover:bg-canopy-700"
          >
            Edit
          </button>
          <button
            onClick={() => setLassoMode('add')}
            className="px-2 py-1.5 rounded-md text-xs font-medium text-ink hover:bg-canopy-50"
            title="Circle more trees to add them"
          >
            + Add
          </button>
          <button
            onClick={() => setLassoMode('subtract')}
            className="px-2 py-1.5 rounded-md text-xs font-medium text-ink hover:bg-canopy-50"
            title="Circle trees to take them out"
          >
            − Remove
          </button>
          <button
            onClick={clearPicked}
            className="px-2 py-1.5 rounded-md text-xs font-medium text-bark hover:bg-canopy-50"
          >
            Clear
          </button>
        </div>
      )}

      {gridOpen && (
        <TreeGridEditor
          orchardId={orchard.id}
          trees={trees}
          selectedIds={picked}
          onClose={() => setGridOpen(false)}
          onSaved={() => {
            void refresh();
          }}
        />
      )}

      {/* Group action dialog */}
      {groupActionOpen && (
        <GroupActionDialog
          open={groupActionOpen}
          onOpenChange={setGroupActionOpen}
          orchardId={orchard.id}
          trees={trees}
          onApplied={refresh}
        />
      )}

      {/* Walk (survey) mode sheet */}
      {walkMode && (
        <WalkMode
          orchardId={orchard.id}
          trees={trees}
          settings={walkSettings}
          startTreeId={selectedTreeId}
          onPathPreview={setWalkPath}
          onProgress={handleWalkProgress}
          onSetStatus={walkSetStatus}
          onFocusTree={focusWalkTree}
          pests={pestLibrary.entries}
          pestSightings={pestLibrary.counts}
          pestsRanked={pestsRanked}
          onExit={() => {
            setWalkMode(false);
            clear();
          }}
        />
      )}

      {/* Edit-mode placement panel */}
      {trapMode && canEdit && (
        <TrapModePanel
          trapType={trapType}
          label={trapLabel}
          placedCount={trapsPlaced}
          onTrapTypeChange={setTrapType}
          onLabelChange={setTrapLabel}
          onExit={() => {
            setTrapMode(false);
            setTrapsPlaced(0);
          }}
        />
      )}

      {selectedTrap && (
        <TrapDetailPanel
          trap={selectedTrap}
          orchardId={orchard.id}
          today={todayYmd}
          canEdit={canEdit}
          onRecordCount={trapCount}
          onRetire={trapRetire}
          onClose={() => setSelectedTrapId(null)}
        />
      )}

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

      {/* Tree details (suppressed during a walk — the sheet owns the screen) */}
      {selectedTree && !walkMode && !movingTree && !detectMode && (
        <TreeDetailPanel
          key={selectedTree.tree_id}
          tree={selectedTree}
          canEdit={canEdit}
          saving={saving}
          walkSettings={walkSettings}
          onClose={clear}
          onSetStatus={walkSetStatus}
          onInspected={markInspected}
          pests={pestLibrary.entries}
          pestSightings={pestLibrary.counts}
          pestsRanked={pestsRanked}
          onDelete={handleDelete}
          onStartMove={() => {
            setMovingTree(selectedTree);
            clear();
          }}
          onMoved={refresh}
        />
      )}

      {movingTree && !walkMode && (
        <MoveTreeController
          map={mapObj}
          tree={movingTree}
          saving={saving}
          onSave={async (lng, lat) => {
            const ok = await move(movingTree.tree_id, lng, lat);
            if (ok) {
              showToast('success', 'Tree position updated');
              setMovingTree(null);
            }
          }}
          onCancel={() => setMovingTree(null)}
        />
      )}
    </div>
  );
}
