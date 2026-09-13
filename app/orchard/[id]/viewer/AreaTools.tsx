'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { toast } from 'sonner';
import { Move, Trash2 } from 'lucide-react';
import {
  createArea,
  updateArea,
  deleteArea,
  type OrchardArea,
  type AreaKind,
  ApiError,
} from '@/lib/api/areas';
import type { LngLat, OrchardBoundary } from '@/lib/types';
import { AREA_KIND_COLORS } from './useAreaLayer';

const DRAFT_SOURCE = 'area-draft';
const DRAFT_FILL = 'area-draft-fill';
const DRAFT_LINE = 'area-draft-line';

const KIND_LABEL: Record<AreaKind, string> = {
  garden: 'Garden bed',
  berries: 'Berries',
  block: 'Block',
  building: 'Building',
  area: 'Area',
};

function ringToPolygon(verts: LngLat[]): OrchardBoundary {
  return { type: 'Polygon', coordinates: [[...verts, verts[0]]] };
}

/** Open ring (no closing duplicate) from a stored polygon. */
function polygonToRing(polygon: OrchardBoundary): LngLat[] {
  const ring = polygon.coordinates[0] ?? [];
  return ring.slice(0, Math.max(0, ring.length - 1)) as LngLat[];
}

function handleEl(kind: 'vertex' | 'mid' | 'move'): HTMLDivElement {
  const el = document.createElement('div');
  if (kind === 'move') {
    el.style.cssText =
      'width:26px;height:26px;border-radius:50%;background:#1B4332;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;cursor:grab;';
    el.textContent = '✥';
  } else if (kind === 'vertex') {
    el.style.cssText =
      'width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid #D9481C;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:grab;';
  } else {
    el.style.cssText =
      'width:11px;height:11px;border-radius:50%;background:#fff;border:2px solid #D9481C;opacity:.65;cursor:grab;';
  }
  return el;
}

interface AreaToolsProps {
  map: maplibregl.Map | null;
  mapReady: boolean;
  orchardId: string;
  active: boolean;
  areas: OrchardArea[];
  setAreas: React.Dispatch<React.SetStateAction<OrchardArea[]>>;
  selectedId: number | null;
  setSelectedId: (id: number | null) => void;
  onExit: () => void;
}

/**
 * Area drawing + reshaping tools.
 *
 * Draw: tap the map to drop corners, then "Finish shape".
 * Reshape (a selected area): drag the white corner handles; drag a
 * small midpoint dot to add a corner; tap a corner to remove it;
 * drag the ✥ handle to move the whole shape. Save or discard.
 */
export default function AreaTools({
  map,
  mapReady,
  orchardId,
  active,
  areas,
  setAreas,
  selectedId,
  setSelectedId,
  onExit,
}: AreaToolsProps) {
  const [drawing, setDrawing] = useState(false);
  const [verts, setVerts] = useState<LngLat[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AreaKind>('area');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => areas.find((a) => a.id === selectedId) ?? null,
    [areas, selectedId]
  );

  // Entering/leaving states
  const startDraw = () => {
    setSelectedId(null);
    setDrawing(true);
    setVerts([]);
    setName('');
    setKind('area');
    setDirty(false);
  };
  const resetAll = useCallback(() => {
    setDrawing(false);
    setVerts([]);
    setName('');
    setDirty(false);
  }, []);

  // Selection / activation changes adjust state during render (the
  // React-sanctioned pattern; the repo lints against setState-in-effect)
  const [prevSelectedId, setPrevSelectedId] = useState<number | null>(null);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    if (selected) {
      setDrawing(false);
      setVerts(polygonToRing(selected.polygon));
      setName(selected.name);
      setKind((selected.kind as AreaKind) ?? 'area');
      setDirty(false);
    } else if (!drawing) {
      setVerts([]);
    }
  }
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (!active) {
      setDrawing(false);
      setVerts([]);
      setName('');
      setDirty(false);
    }
  }

  // ---- draft layers (drawing or reshaping preview) ----
  useEffect(() => {
    if (!mapReady || !map) return;
    if (map.getSource(DRAFT_SOURCE)) return;
    map.addSource(DRAFT_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({
      id: DRAFT_FILL,
      type: 'fill',
      source: DRAFT_SOURCE,
      paint: { 'fill-color': '#D9481C', 'fill-opacity': 0.18 },
    });
    map.addLayer({
      id: DRAFT_LINE,
      type: 'line',
      source: DRAFT_SOURCE,
      paint: {
        'line-color': '#D9481C',
        'line-width': 2.5,
        'line-dasharray': [2, 1.5],
      },
    });
    return () => {
      if (!map.style) return;
      if (map.getLayer(DRAFT_LINE)) map.removeLayer(DRAFT_LINE);
      if (map.getLayer(DRAFT_FILL)) map.removeLayer(DRAFT_FILL);
      if (map.getSource(DRAFT_SOURCE)) map.removeSource(DRAFT_SOURCE);
    };
  }, [map, mapReady]);

  useEffect(() => {
    if (!mapReady || !map) return;
    const source = map.getSource(DRAFT_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    if (verts.length === 0) {
      source.setData({ type: 'FeatureCollection', features: [] });
    } else if (verts.length < 3) {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: verts },
      });
    } else {
      source.setData({
        type: 'Feature',
        properties: {},
        geometry: ringToPolygon(verts),
      });
    }
  }, [map, mapReady, verts]);

  // ---- drawing clicks ----
  const drawingRef = useRef(drawing);
  const activeRef = useRef(active);
  useEffect(() => {
    drawingRef.current = drawing;
    activeRef.current = active;
  });
  useEffect(() => {
    if (!mapReady || !map) return;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (!activeRef.current || !drawingRef.current) return;
      setVerts((prev) => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
      setDirty(true);
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map, mapReady]);

  // ---- handles (reshape existing OR adjust draft corners) ----
  //
  // Drags are handled imperatively: during a gesture we mutate a ref
  // and repaint the draft source + sibling markers directly, and only
  // commit to React state on dragend. Committing per-frame would tear
  // down and rebuild every marker mid-drag — which killed the drag,
  // made handles jerky, and broke tap-to-delete.
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const vertsRef = useRef<LngLat[]>(verts);
  useEffect(() => {
    vertsRef.current = verts;
  }, [verts]);
  // Bumped when a drag gesture completes, so handles (midpoints, the ✥
  // centroid) rebuild once per gesture at their new positions.
  const [gestureEpoch, setGestureEpoch] = useState(0);
  const editing = active && (drawing || selected !== null) && verts.length > 0;

  const paintDraft = useCallback(
    (ring: LngLat[]) => {
      const source = map?.getSource(DRAFT_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      if (ring.length === 0) {
        source.setData({ type: 'FeatureCollection', features: [] });
      } else if (ring.length < 3) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: ring },
        });
      } else {
        source.setData({ type: 'Feature', properties: {}, geometry: ringToPolygon(ring) });
      }
    },
    [map],
  );

  useEffect(() => {
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (!editing) return;

    const ring = vertsRef.current;
    const markers: maplibregl.Marker[] = [];
    const vertexMarkers: maplibregl.Marker[] = [];

    // Corner handles: drag to move (smooth, committed on release),
    // tap to remove (when > 3 corners)
    ring.forEach((v, i) => {
      const marker = new maplibregl.Marker({
        element: handleEl('vertex'),
        draggable: true,
        anchor: 'center',
      })
        .setLngLat(v)
        .addTo(map);
      marker.on('drag', () => {
        const ll = marker.getLngLat();
        vertsRef.current = vertsRef.current.map((p, j) =>
          j === i ? ([ll.lng, ll.lat] as LngLat) : p,
        );
        paintDraft(vertsRef.current);
      });
      marker.on('dragend', () => {
        setVerts(vertsRef.current);
        setDirty(true);
        setGestureEpoch((e) => e + 1);
      });
      // Tap detection independent of the marker's drag machinery: a
      // press that travels < 6 px is a tap even if a micro-drag fired.
      const el = marker.getElement();
      let down: [number, number] | null = null;
      el.addEventListener('pointerdown', (ev) => {
        down = [ev.clientX, ev.clientY];
      });
      el.addEventListener('pointerup', (ev) => {
        if (!down) return;
        const dist = Math.hypot(ev.clientX - down[0], ev.clientY - down[1]);
        down = null;
        if (dist >= 6) return;
        ev.stopPropagation();
        if (vertsRef.current.length <= 3) {
          toast.warning('A shape needs at least 3 corners');
          return;
        }
        vertsRef.current = vertsRef.current.filter((_, j) => j !== i);
        setVerts(vertsRef.current);
        setDirty(true);
      });
      markers.push(marker);
      vertexMarkers.push(marker);
    });

    // Midpoint handles: drag to add a corner (committed on release)
    if (ring.length >= 2) {
      ring.forEach((v, i) => {
        const next = ring[(i + 1) % ring.length];
        if (ring.length === 2 && i === 1) return;
        const mid: LngLat = [(v[0] + next[0]) / 2, (v[1] + next[1]) / 2];
        const marker = new maplibregl.Marker({
          element: handleEl('mid'),
          draggable: true,
          anchor: 'center',
        })
          .setLngLat(mid)
          .addTo(map);
        marker.on('drag', () => {
          const ll = marker.getLngLat();
          const preview = [...vertsRef.current];
          preview.splice(i + 1, 0, [ll.lng, ll.lat]);
          paintDraft(preview);
        });
        marker.on('dragend', () => {
          const ll = marker.getLngLat();
          const out = [...vertsRef.current];
          out.splice(i + 1, 0, [ll.lng, ll.lat]);
          vertsRef.current = out;
          setVerts(out);
          setDirty(true);
        });
        markers.push(marker);
      });
    }

    // Whole-shape move handle at the centroid: translates every corner
    // live (draft + corner handles repainted imperatively per frame)
    if (ring.length >= 3) {
      const cx = ring.reduce((s, v) => s + v[0], 0) / ring.length;
      const cy = ring.reduce((s, v) => s + v[1], 0) / ring.length;
      const moveMarker = new maplibregl.Marker({
        element: handleEl('move'),
        draggable: true,
        anchor: 'center',
      })
        .setLngLat([cx, cy])
        .addTo(map);
      let last: [number, number] = [cx, cy];
      moveMarker.on('dragstart', () => {
        const ll = moveMarker.getLngLat();
        last = [ll.lng, ll.lat];
      });
      moveMarker.on('drag', () => {
        const ll = moveMarker.getLngLat();
        const dx = ll.lng - last[0];
        const dy = ll.lat - last[1];
        last = [ll.lng, ll.lat];
        vertsRef.current = vertsRef.current.map(
          ([x, y]) => [x + dx, y + dy] as LngLat,
        );
        vertexMarkers.forEach((vm, j) => {
          const p = vertsRef.current[j];
          if (p) vm.setLngLat(p);
        });
        paintDraft(vertsRef.current);
      });
      moveMarker.on('dragend', () => {
        setVerts(vertsRef.current);
        setDirty(true);
        setGestureEpoch((e) => e + 1);
      });
      markers.push(moveMarker);
    }

    markersRef.current = markers;
    return () => {
      markers.forEach((m) => m.remove());
      markersRef.current = [];
    };
    // Rebuild only when the corner count or target changes — never per-frame
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, editing, verts.length, selectedId, drawing, paintDraft, gestureEpoch]);

  // ---- persistence ----
  const save = async () => {
    if (verts.length < 3 || !name.trim()) return;
    setSaving(true);
    try {
      if (drawing) {
        const area = await createArea({
          orchardId,
          name: name.trim(),
          kind,
          polygon: ringToPolygon(verts),
        });
        setAreas((prev) => [...prev, area]);
        toast.success(`Added ${area.name}`);
        resetAll();
      } else if (selected) {
        const area = await updateArea({
          id: selected.id,
          name: name.trim(),
          kind,
          polygon: ringToPolygon(verts),
        });
        setAreas((prev) => prev.map((a) => (a.id === area.id ? area : a)));
        toast.success(`Saved ${area.name}`);
        setSelectedId(null);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await deleteArea(selected.id);
      setAreas((prev) => prev.filter((a) => a.id !== selected.id));
      toast.success(`Deleted ${selected.name}`);
      setSelectedId(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  if (!active) return null;

  return (
    <div className="absolute top-20 left-4 z-20 bg-surface rounded-xl shadow-lg border border-canopy-600/30 p-4 w-[272px] max-h-[calc(100dvh-7rem)] overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs font-semibold tracking-wider text-canopy-700">
          AREAS
        </span>
        <button
          onClick={onExit}
          className="text-xs text-bark hover:text-ink px-2 py-1 rounded bg-paper"
        >
          Exit (Esc)
        </button>
      </div>

      {!drawing && !selected && (
        <>
          <p className="text-xs text-bark mb-3">
            Tap an area on the map to reshape it, or draw a new one.
          </p>
          <button
            onClick={startDraw}
            className="w-full px-3 py-2 bg-canopy-600 text-white dark:text-paper text-sm font-medium rounded-md hover:bg-canopy-700"
          >
            Draw new area
          </button>
          {areas.length > 0 && (
            <ul className="mt-3 space-y-1">
              {areas.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => setSelectedId(a.id)}
                    className="w-full text-left text-sm px-2 py-1.5 rounded-md hover:bg-canopy-50 text-ink flex items-center gap-2"
                  >
                    <span
                      aria-hidden
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{
                        backgroundColor: a.color || AREA_KIND_COLORS[a.kind] || AREA_KIND_COLORS.area,
                      }}
                    />
                    <span className="truncate">{a.name}</span>
                    <span className="ml-auto text-[11px] text-bark">{KIND_LABEL[a.kind as AreaKind] ?? a.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {(drawing || selected) && (
        <>
          <p className="text-xs text-bark mb-2">
            {drawing
              ? verts.length < 3
                ? `Tap the map to drop corners (${verts.length}/3 minimum).`
                : 'Tap for more corners, or adjust the handles.'
              : 'Drag corners to reshape · drag a small dot to add a corner · tap a corner to remove it · drag ✥ to move the shape.'}
          </p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Raised garden)"
            className="w-full text-sm px-2.5 py-1.5 bg-surface text-ink border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-canopy-600 mb-2"
          />
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as AreaKind);
              setDirty(true);
            }}
            className="w-full text-sm px-2.5 py-1.5 bg-surface text-ink border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-canopy-600 mb-3"
          >
            {(Object.keys(KIND_LABEL) as AreaKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving || verts.length < 3 || !name.trim() || (!drawing && !dirty && name.trim() === selected?.name)}
              className="flex-1 px-3 py-2 bg-canopy-600 text-white dark:text-paper text-sm font-medium rounded-md hover:bg-canopy-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : drawing ? 'Finish shape' : 'Save changes'}
            </button>
            <button
              onClick={() => {
                resetAll();
                setSelectedId(null);
              }}
              disabled={saving}
              className="px-3 py-2 text-sm rounded-md bg-paper text-ink hover:bg-line"
            >
              Cancel
            </button>
          </div>
          {selected && !drawing && (
            <button
              onClick={remove}
              disabled={saving}
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-destructive hover:bg-destructive/10"
            >
              <Trash2 aria-hidden size={13} /> Delete area
            </button>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-bark/80">
            <Move aria-hidden size={12} /> Handles work by touch or mouse.
          </p>
        </>
      )}
    </div>
  );
}
