'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { OrchardConfig } from '@/lib/types';
import { buildMapStyle } from '@/lib/map-style';
import { ensurePmtilesProtocol } from '@/lib/pmtiles-protocol';

export default function PreviewMap({ orchard }: { orchard: OrchardConfig }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    ensurePmtilesProtocol();
    const m = new maplibregl.Map({
      container: container.current,
      style: buildMapStyle(orchard, window.location.origin),
      center: orchard.center,
      zoom: orchard.defaultZoom,
      attributionControl: false,
      interactive: false,
    });
    m.fitBounds(
      [
        [orchard.bounds.minLng, orchard.bounds.minLat],
        [orchard.bounds.maxLng, orchard.bounds.maxLat],
      ],
      { padding: 8, animate: false }
    );
    m.on('idle', () => {
      document.body.dataset.previewReady = 'true';
    });
    return () => {
      m.remove();
    };
  }, [orchard]);

  return (
    <>
      <style>{`.maplibregl-ctrl, .maplibregl-ctrl-attrib { display: none !important; }`}</style>
      <div ref={container} style={{ width: '100vw', height: '100vh', background: '#e8eae5' }} />
    </>
  );
}
