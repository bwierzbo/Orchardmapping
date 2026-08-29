import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type maplibregl from 'maplibre-gl';

/**
 * Selected tree lives in ?tree=<tree_id>. pushState on select (browser
 * Back closes the panel); the param is dropped with replaceState on
 * close. Next.js keeps useSearchParams in sync with native history.
 */
export function useTreeSelection() {
  const searchParams = useSearchParams();
  const selectedTreeId = searchParams.get('tree');

  const select = useCallback((treeId: string) => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('tree') === treeId) return;
    url.searchParams.set('tree', treeId);
    window.history.pushState(null, '', url);
  }, []);

  const clear = useCallback(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('tree')) return;
    url.searchParams.delete('tree');
    window.history.replaceState(null, '', url);
  }, []);

  return { selectedTreeId, select, clear };
}

/** Camera hash: #map=<z>/<lat>/<lng>. */
export function parseMapHash(hash: string): { zoom: number; lat: number; lng: number } | null {
  const match = /^#map=([\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)$/.exec(hash);
  if (!match) return null;
  const [, z, lat, lng] = match;
  const zoom = parseFloat(z);
  const latN = parseFloat(lat);
  const lngN = parseFloat(lng);
  if ([zoom, latN, lngN].some(Number.isNaN)) return null;
  if (Math.abs(latN) > 90 || Math.abs(lngN) > 180) return null;
  return { zoom, lat: latN, lng: lngN };
}

/**
 * Mirrors the camera into the URL hash with a debounced replaceState on
 * moveend — a hash (not a search param) so panning never re-runs RSC.
 */
export function useMapUrlState(map: maplibregl.Map | null, mapReady: boolean) {
  useEffect(() => {
    if (!mapReady || !map) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onMoveEnd = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const c = map.getCenter();
        const hash = `#map=${map.getZoom().toFixed(2)}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`;
        window.history.replaceState(null, '', window.location.pathname + window.location.search + hash);
      }, 300);
    };

    map.on('moveend', onMoveEnd);
    return () => {
      if (timer) clearTimeout(timer);
      map.off('moveend', onMoveEnd);
    };
  }, [map, mapReady]);
}
