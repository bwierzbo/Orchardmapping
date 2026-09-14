'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Button } from '@/components/ui/button';
import type { ClientTree } from '@/lib/types';

interface MoveTreeControllerProps {
  map: maplibregl.Map | null;
  tree: ClientTree;
  saving: boolean;
  onSave: (lng: number, lat: number) => void;
  onCancel: () => void;
}

/**
 * "Move on map" flow from the tree panel: a draggable pin appears on
 * the tree, the user drags it to where the tree really stands, and
 * Save writes the new position — no Edit Mode required. This mirrors
 * the discover-flow pin, which is the interaction that teaches users
 * dots can be dragged.
 */
export default function MoveTreeController({
  map,
  tree,
  saving,
  onSave,
  onCancel,
}: MoveTreeControllerProps) {
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    if (!map || tree.lat == null || tree.lng == null) return;
    const el = document.createElement('div');
    el.style.cssText =
      'width:22px;height:22px;border-radius:50%;background:#2F6B3C;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:grab;';
    const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
      .setLngLat([tree.lng, tree.lat])
      .addTo(map);
    marker.on('dragend', () => setMoved(true));
    markerRef.current = marker;
    map.flyTo({ center: [tree.lng, tree.lat], zoom: Math.max(map.getZoom(), 18) });
    return () => {
      marker.remove();
      markerRef.current = null;
    };
  }, [map, tree]);

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 bg-surface rounded-xl shadow-lg border border-line px-3 py-2.5 flex items-center gap-2">
      <p className="text-xs text-bark max-w-44">
        Drag the pin to where {tree.variety || 'this tree'} really stands, then save.
      </p>
      <Button
        size="sm"
        className="h-9"
        disabled={saving || !moved}
        onClick={() => {
          const ll = markerRef.current?.getLngLat();
          if (ll) onSave(ll.lng, ll.lat);
        }}
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
      <Button size="sm" variant="secondary" className="h-9" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
    </div>
  );
}
