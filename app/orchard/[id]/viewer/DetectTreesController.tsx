'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { toast } from 'sonner';
import { Loader2, ScanSearch } from 'lucide-react';
import {
  ESRI_TILE_URL,
  DEFAULT_DETECT_OPTIONS,
  detectTreesInPolygon,
  lngLatToWorldPx,
  metersBetween,
  type Detection,
} from '@/lib/tree-detect';
import type { ClientTree, LngLat, OrchardBoundary } from '@/lib/types';

const DRAFT_SOURCE = 'detect-draft';
const DRAFT_FILL = 'detect-draft-fill';
const DRAFT_LINE = 'detect-draft-line';
const DOTS_SOURCE = 'detect-dots';
const DOTS_LAYER = 'detect-dots-circles';

const DETECT_ZOOM = 19;
const MAX_TILES = 144; // 12×12 at z19 ≈ 600×600 m

interface Mosaic {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

/** Fetch Esri imagery tiles covering the ring's bbox into one RGBA mosaic. */
async function fetchMosaic(ring: [number, number][]): Promise<Mosaic> {
  const lngs = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const tl = lngLatToWorldPx(Math.min(...lngs), Math.max(...lats), DETECT_ZOOM);
  const br = lngLatToWorldPx(Math.max(...lngs), Math.min(...lats), DETECT_ZOOM);
  const tx0 = Math.floor(tl.x / 256);
  const ty0 = Math.floor(tl.y / 256);
  const tx1 = Math.floor(br.x / 256);
  const ty1 = Math.floor(br.y / 256);
  const cols = tx1 - tx0 + 1;
  const rows = ty1 - ty0 + 1;
  if (cols * rows > MAX_TILES) {
    throw new Error('Area too large to scan at once — outline a smaller block');
  }
  const width = cols * 256;
  const height = rows * 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const jobs: Promise<void>[] = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      jobs.push(
        (async () => {
          const res = await fetch(ESRI_TILE_URL(DETECT_ZOOM, tx, ty));
          if (!res.ok) return; // missing tile → stays black, scores ~0
          const bitmap = await createImageBitmap(await res.blob());
          ctx.drawImage(bitmap, (tx - tx0) * 256, (ty - ty0) * 256);
          bitmap.close();
        })()
      );
    }
  }
  await Promise.all(jobs);
  const data = ctx.getImageData(0, 0, width, height).data;
  return { rgba: data, width, height, originX: tx0 * 256, originY: ty0 * 256 };
}

interface DetectTreesControllerProps {
  map: maplibregl.Map | null;
  mapReady: boolean;
  orchardId: string;
  trees: ClientTree[];
  /** Orchard boundary, offered as a ready-made scan outline. */
  boundary: OrchardBoundary | null;
  active: boolean;
  onSaved: () => void;
  onExit: () => void;
}

type Phase = 'draw' | 'detecting' | 'review' | 'saving';

/**
 * Auto-detect trees from satellite imagery: outline a block (or reuse
 * the orchard boundary), blob-detect crowns in the Esri tiles, review
 * the proposed dots (tap one to drop it, tune spacing/sensitivity),
 * then bulk-save. Cleanup afterwards uses the normal tree tools.
 */
export default function DetectTreesController({
  map,
  mapReady,
  orchardId,
  trees,
  boundary,
  active,
  onSaved,
  onExit,
}: DetectTreesControllerProps) {
  const [phase, setPhase] = useState<Phase>('draw');
  const [verts, setVerts] = useState<LngLat[]>([]);
  const [found, setFound] = useState<Detection[]>([]);
  const [dropped, setDropped] = useState<ReadonlySet<number>>(new Set());
  const [spacing, setSpacing] = useState(DEFAULT_DETECT_OPTIONS.minSpacingM);
  const [threshold, setThreshold] = useState(DEFAULT_DETECT_OPTIONS.threshold);
  const mosaicRef = useRef<Mosaic | null>(null);
  const ringRef = useRef<[number, number][]>([]);

  // Reset whenever the tool opens/closes (refs cleared in an effect —
  // render must not touch them)
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    setPhase('draw');
    setVerts([]);
    setFound([]);
    setDropped(new Set());
  }
  useEffect(() => {
    if (!active) mosaicRef.current = null;
  }, [active]);

  // ---- draft outline layers ----
  useEffect(() => {
    if (!mapReady || !map || !active) return;
    map.addSource(DRAFT_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({
      id: DRAFT_FILL,
      type: 'fill',
      source: DRAFT_SOURCE,
      paint: { 'fill-color': '#1D6FB8', 'fill-opacity': 0.12 },
    });
    map.addLayer({
      id: DRAFT_LINE,
      type: 'line',
      source: DRAFT_SOURCE,
      paint: { 'line-color': '#1D6FB8', 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
    });
    map.addSource(DOTS_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      promoteId: 'idx',
    });
    map.addLayer({
      id: DOTS_LAYER,
      type: 'circle',
      source: DOTS_SOURCE,
      paint: {
        'circle-radius': 7,
        'circle-color': ['case', ['get', 'off'], '#8A8578', '#D9481C'],
        'circle-opacity': ['case', ['get', 'off'], 0.35, 0.85],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });
    return () => {
      if (!map.style) return;
      for (const l of [DOTS_LAYER, DRAFT_LINE, DRAFT_FILL]) {
        if (map.getLayer(l)) map.removeLayer(l);
      }
      for (const s of [DOTS_SOURCE, DRAFT_SOURCE]) {
        if (map.getSource(s)) map.removeSource(s);
      }
    };
  }, [map, mapReady, active]);

  const paintOutline = useCallback(
    (ring: LngLat[]) => {
      const src = map?.getSource(DRAFT_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (ring.length === 0) {
        src.setData({ type: 'FeatureCollection', features: [] });
      } else if (ring.length < 3) {
        src.setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: ring },
        });
      } else {
        src.setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
        });
      }
    },
    [map]
  );

  useEffect(() => {
    if (active) paintOutline(verts);
  }, [active, verts, paintOutline]);

  const paintDots = useCallback(
    (detections: Detection[], off: ReadonlySet<number>) => {
      const src = map?.getSource(DOTS_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: 'FeatureCollection',
        features: detections.map((d, i) => ({
          type: 'Feature',
          properties: { idx: i, off: off.has(i) },
          geometry: { type: 'Point', coordinates: [d.lng, d.lat] },
        })),
      });
    },
    [map]
  );

  // ---- map interactions ----
  const phaseRef = useRef(phase);
  const activeRef = useRef(active);
  useEffect(() => {
    phaseRef.current = phase;
    activeRef.current = active;
  });
  useEffect(() => {
    if (!mapReady || !map || !active) return;
    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      if (!activeRef.current || phaseRef.current !== 'draw') return;
      setVerts((prev) => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
    };
    const onDotClick = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      if (phaseRef.current !== 'review') return;
      const idx = e.features?.[0]?.properties?.idx;
      if (typeof idx !== 'number') return;
      setDropped((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
    };
    map.on('click', onMapClick);
    map.on('click', DOTS_LAYER, onDotClick);
    return () => {
      map.off('click', onMapClick);
      map.off('click', DOTS_LAYER, onDotClick);
    };
  }, [map, mapReady, active]);

  useEffect(() => {
    if (active && phase === 'review') paintDots(found, dropped);
  }, [active, phase, found, dropped, paintDots]);

  // ---- detection ----
  const runDetection = useCallback(
    (mosaic: Mosaic, ring: [number, number][], spacingM: number, thr: number) => {
      const detections = detectTreesInPolygon(
        mosaic.rgba,
        mosaic.width,
        mosaic.height,
        mosaic.originX,
        mosaic.originY,
        DETECT_ZOOM,
        ring,
        { minSpacingM: spacingM, threshold: thr, crownRadiusM: DEFAULT_DETECT_OPTIONS.crownRadiusM }
      );
      // Skip spots the map already has a tree on
      return detections.filter((d) =>
        trees.every(
          (t) =>
            t.lat == null ||
            t.lng == null ||
            metersBetween(d.lng, d.lat, t.lng, t.lat) >= spacingM
        )
      );
    },
    [trees]
  );

  const detect = async (ring: LngLat[]) => {
    const closed = ring.map((p) => [p[0], p[1]] as [number, number]);
    setPhase('detecting');
    try {
      ringRef.current = closed;
      const mosaic = mosaicRef.current ?? (await fetchMosaic(closed));
      mosaicRef.current = mosaic;
      const detections = runDetection(mosaic, closed, spacing, threshold);
      setFound(detections);
      setDropped(new Set());
      setPhase('review');
      if (detections.length === 0) {
        toast.info('No tree crowns found — try raising sensitivity');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Detection failed');
      setPhase('draw');
    }
  };

  const redetect = (spacingM: number, thr: number) => {
    const mosaic = mosaicRef.current;
    if (!mosaic) return;
    const detections = runDetection(mosaic, ringRef.current, spacingM, thr);
    setFound(detections);
    setDropped(new Set());
  };

  const useBoundary = () => {
    if (!boundary) return;
    const ring = (boundary.coordinates[0] ?? []).slice(0, -1) as LngLat[];
    if (ring.length < 3) return;
    setVerts(ring);
    detect(ring);
  };

  // ---- save ----
  const save = async () => {
    const keep = found.filter((_, i) => !dropped.has(i));
    if (keep.length === 0) return;
    // Continue Scan-row numbering across repeat runs
    let nextPos = 1;
    for (const t of trees) {
      if (t.row_id === 'Scan') {
        const n = parseInt(String(t.position), 10);
        if (Number.isFinite(n) && n >= nextPos) nextPos = n + 1;
      }
    }
    // West→east so positions read across the block
    const ordered = [...keep].sort((a, b) => a.lng - b.lng);
    setPhase('saving');
    try {
      const res = await fetch('/api/trees/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orchard_id: orchardId,
          updates: ordered.map((d, i) => ({
            row_id: 'Scan',
            position: String(nextPos + i),
            lat: d.lat,
            lng: d.lng,
            status: 'unknown',
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Save failed');
      toast.success(`Added ${ordered.length} trees — tap any dot to fix variety or position`);
      onSaved();
      onExit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
      setPhase('review');
    }
  };

  if (!active) return null;

  const keptCount = found.length - dropped.size;

  return (
    <div className="absolute top-20 left-4 z-20 bg-surface rounded-xl shadow-lg border border-canopy-600/30 p-4 w-[272px] max-h-[calc(100dvh-7rem)] overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs font-semibold tracking-wider text-canopy-700 inline-flex items-center gap-1.5">
          <ScanSearch aria-hidden size={14} /> DETECT TREES
        </span>
        <button
          onClick={onExit}
          className="text-xs text-bark hover:text-ink px-2 py-1 rounded bg-paper"
        >
          Exit
        </button>
      </div>

      {phase === 'draw' && (
        <>
          <p className="text-xs text-bark mb-3">
            Outline the block to scan — tap the map to drop corners (
            {verts.length}/3 minimum). Only crowns inside the outline are
            marked.
          </p>
          {boundary && verts.length === 0 && (
            <button
              onClick={useBoundary}
              className="w-full mb-2 px-3 py-2 border border-canopy-600/50 text-canopy-700 dark:text-canopy-100 text-sm font-medium rounded-md hover:bg-canopy-50"
            >
              Use orchard boundary
            </button>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => detect(verts)}
              disabled={verts.length < 3}
              className="flex-1 px-3 py-2 bg-canopy-600 text-white dark:text-paper text-sm font-medium rounded-md hover:bg-canopy-700 disabled:opacity-50"
            >
              Find trees
            </button>
            <button
              onClick={() => setVerts([])}
              disabled={verts.length === 0}
              className="px-3 py-2 text-sm rounded-md bg-paper text-ink hover:bg-line disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </>
      )}

      {phase === 'detecting' && (
        <p className="text-sm text-bark flex items-center gap-2 py-2">
          <Loader2 aria-hidden size={15} className="animate-spin" /> Reading imagery…
        </p>
      )}

      {(phase === 'review' || phase === 'saving') && (
        <>
          <p className="text-xs text-bark mb-3">
            <strong className="text-ink">{keptCount}</strong> trees marked
            {dropped.size > 0 ? ` (${dropped.size} dropped)` : ''}. Tap a dot to
            drop or restore it; missed trees are added afterwards with the
            normal tools.
          </p>
          <label className="block text-xs text-bark mb-2">
            Tree spacing: <span className="text-ink font-medium">{spacing.toFixed(1)} m</span>
            <input
              type="range"
              min={1.5}
              max={8}
              step={0.5}
              value={spacing}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSpacing(v);
                redetect(v, threshold);
              }}
              className="w-full accent-[rgb(var(--canopy-600))]"
            />
          </label>
          <label className="block text-xs text-bark mb-3">
            Sensitivity:{' '}
            <span className="text-ink font-medium">
              {Math.round(((0.3 - threshold) / 0.24) * 100)}%
            </span>
            <input
              type="range"
              min={0.06}
              max={0.3}
              step={0.01}
              // Higher slider = lower threshold = more detections
              value={0.36 - threshold}
              onChange={(e) => {
                const v = Number((0.36 - Number(e.target.value)).toFixed(2));
                setThreshold(v);
                redetect(spacing, v);
              }}
              className="w-full accent-[rgb(var(--canopy-600))]"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={phase === 'saving' || keptCount === 0}
              className="flex-1 px-3 py-2 bg-canopy-600 text-white dark:text-paper text-sm font-medium rounded-md hover:bg-canopy-700 disabled:opacity-50"
            >
              {phase === 'saving' ? 'Saving…' : `Save ${keptCount} trees`}
            </button>
            <button
              onClick={() => {
                setFound([]);
                setDropped(new Set());
                paintDots([], new Set());
                setPhase('draw');
              }}
              disabled={phase === 'saving'}
              className="px-3 py-2 text-sm rounded-md bg-paper text-ink hover:bg-line"
            >
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}
