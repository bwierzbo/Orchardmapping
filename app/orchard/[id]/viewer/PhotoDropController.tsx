'use client';

import { useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { upload } from '@vercel/blob/client';
import { toast } from 'sonner';
import { Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createTreeEvent, ApiError } from '@/lib/api/trees';
import type { ClientTree } from '@/lib/types';

/** Meters between two lng/lat points (equirectangular, fine at orchard scale). */
function metersBetween(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const mLat = 111320;
  const mLng = 111320 * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  return Math.hypot((aLng - bLng) * mLng, (aLat - bLat) * mLat);
}

const ATTACH_RADIUS_M = 12;

interface PhotoDropControllerProps {
  map: maplibregl.Map | null;
  trees: ClientTree[];
  /** A tree already called up (detail panel open): photos attach to it
   *  directly — no pin dragging. Null = the drag-a-pin flow. */
  targetTree?: ClientTree | null;
  /** Photo settings toggle + edit rights + no competing mode active. */
  enabled: boolean;
  onAttached?: () => void;
}

/**
 * Settings-gated geotagged photo drops: the camera button takes a
 * photo, drops a draggable thumbnail pin at the device's GPS position,
 * and "Attach" files it into the history of the nearest tree once the
 * pin has been dragged onto it.
 */
export default function PhotoDropController({
  map,
  trees,
  targetTree = null,
  enabled,
  onAttached,
}: PhotoDropControllerProps) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ url: string } | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const cleanup = () => {
    markerRef.current?.remove();
    markerRef.current = null;
    setPending(null);
  };

  const handlePhoto = async (file: File) => {
    if (!map) return;
    setBusy(true);
    try {
      const ext =
        (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const blob = await upload(`photos/drops/${Date.now()}.${ext}`, file, {
        access: 'public',
        handleUploadUrl: '/api/photos/upload',
      });

      // A tree is already called up: attach straight to it, no pin.
      if (targetTree) {
        await createTreeEvent(targetTree.tree_id, {
          event_type: 'observation',
          detail: 'Photo',
          photo_url: blob.url,
        });
        toast.success(
          `Photo attached to ${targetTree.variety || 'tree'} (R${targetTree.row_id}·P${targetTree.position})`
        );
        onAttached?.();
        return;
      }

      const place = (lng: number, lat: number) => {
        const el = document.createElement('div');
        el.style.cssText =
          'width:44px;height:44px;border-radius:10px;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.5);cursor:grab;background-size:cover;background-position:center;';
        el.style.backgroundImage = `url(${blob.url})`;
        markerRef.current?.remove();
        markerRef.current = new maplibregl.Marker({
          element: el,
          draggable: true,
          anchor: 'center',
        })
          .setLngLat([lng, lat])
          .addTo(map);
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 19) });
        setPending({ url: blob.url });
      };

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => place(pos.coords.longitude, pos.coords.latitude),
          () => {
            const c = map.getCenter();
            toast.info('No GPS fix — pin dropped at map center, drag it to the tree');
            place(c.lng, c.lat);
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      } else {
        const c = map.getCenter();
        place(c.lng, c.lat);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    const marker = markerRef.current;
    if (!marker || !pending || busy) return;
    const ll = marker.getLngLat();
    let best: { tree: ClientTree; d: number } | null = null;
    for (const t of trees) {
      if (t.lat == null || t.lng == null) continue;
      const d = metersBetween(ll.lng, ll.lat, t.lng, t.lat);
      if (!best || d < best.d) best = { tree: t, d };
    }
    if (!best || best.d > ATTACH_RADIUS_M) {
      toast.warning(
        `No tree within ${ATTACH_RADIUS_M} m of the pin — drag it onto the tree first`
      );
      return;
    }
    setBusy(true);
    try {
      await createTreeEvent(best.tree.tree_id, {
        event_type: 'observation',
        detail: 'Geotagged photo',
        photo_url: pending.url,
      });
      toast.success(
        `Photo attached to ${best.tree.variety || 'tree'} (R${best.tree.row_id}·P${best.tree.position})`
      );
      cleanup();
      onAttached?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Attach failed');
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) return null;

  return pending ? (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 bg-surface rounded-xl shadow-lg border border-line px-3 py-2.5 flex items-center gap-2">
      <p className="text-xs text-bark max-w-44">
        Drag the photo onto its tree, then attach.
      </p>
      <Button size="sm" className="h-9" onClick={attach} disabled={busy}>
        {busy ? 'Attaching…' : 'Attach'}
      </Button>
      <Button size="sm" variant="secondary" className="h-9" onClick={cleanup} disabled={busy}>
        Cancel
      </Button>
    </div>
  ) : (
    <label
      className="px-4 py-3 rounded-lg shadow-lg text-sm font-medium bg-surface text-ink hover:bg-canopy-50 cursor-pointer inline-flex items-center gap-2"
      title={
        targetTree
          ? `Photo attaches directly to R${targetTree.row_id}·P${targetTree.position} — Portrait mode blurs the background`
          : 'Take a geotagged photo and drag it onto its tree — Portrait mode blurs the background'
      }
    >
      {busy ? (
        <Loader2 size={15} className="animate-spin" aria-hidden />
      ) : (
        <Camera size={15} aria-hidden />
      )}
      Photo
      {/* No `capture` attr: the chooser lets users shoot Portrait-mode
          photos in the native Camera app and pick them from the library. */}
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handlePhoto(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}
