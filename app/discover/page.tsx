'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { upload } from '@vercel/blob/client';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc/client';
import { createTree, createTreeEvent, ApiError } from '@/lib/api/trees';
import type { OrchardConfig } from '@/lib/types';

/** Compact position label so found trees never collide: MMDD-HHMM. */
function foundPosition(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function inBounds(o: OrchardConfig, lng: number, lat: number): boolean {
  const b = o.bounds;
  if (!b) return false;
  return lng >= b.minLng && lng <= b.maxLng && lat >= b.minLat && lat <= b.maxLat;
}

/**
 * Found-a-tree flow: photograph a tree anywhere, land on the world
 * satellite map at the photo's location (EXIF GPS, else device GPS),
 * fine-tune the dot, and file the tree — into the orchard it falls
 * inside, or into a brand-new point-orchard named on the spot. The
 * photo is attached to the new tree's history.
 */
export default function DiscoverPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const [orchards, setOrchards] = useState<OrchardConfig[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [point, setPoint] = useState<{ lng: number; lat: number } | null>(null);
  const [locSource, setLocSource] = useState<'photo' | 'device' | 'manual'>('manual');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ orchardId: string; treeId: string } | null>(null);

  // form fields
  const [variety, setVariety] = useState('');
  const [rowId, setRowId] = useState('Found');
  const [position, setPosition] = useState(foundPosition);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');

  useEffect(() => {
    trpc.orchard.list.query().then(setOrchards).catch(() => {});
  }, []);

  const containing = point
    ? orchards.find((o) => inBounds(o, point.lng, point.lat)) ?? null
    : null;

  // ---- map lifecycle (world imagery + orchard outlines) ----
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const origin = window.location.origin;
    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: `${origin}/glyphs/{fontstack}/{range}.pbf`,
        sources: {
          satellite: {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution:
              'Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
          },
        },
        layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
      },
      center: [-123.264, 48.114],
      zoom: 13,
    });
    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    m.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
      'top-right'
    );
    m.on('click', (e) => {
      // No marker yet (no GPS anywhere): tap places the dot manually
      setPoint((prev) => (prev ? prev : { lng: e.lngLat.lng, lat: e.lngLat.lat }));
    });
    mapRef.current = m;
    return () => {
      m.remove();
      mapRef.current = null;
    };
  }, []);

  // Orchard outlines + labels
  useEffect(() => {
    const m = mapRef.current;
    if (!m || orchards.length === 0) return;
    const addOverlays = () => {
      if (m.getSource('orchard-outlines')) return;
      m.addSource('orchard-outlines', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: orchards
            .filter((o) => o.bounds)
            .map((o) => ({
              type: 'Feature' as const,
              properties: { name: o.name },
              geometry: o.boundary ?? {
                type: 'Polygon' as const,
                coordinates: [[
                  [o.bounds.minLng, o.bounds.minLat],
                  [o.bounds.maxLng, o.bounds.minLat],
                  [o.bounds.maxLng, o.bounds.maxLat],
                  [o.bounds.minLng, o.bounds.maxLat],
                  [o.bounds.minLng, o.bounds.minLat],
                ]],
              },
            })),
        },
      });
      m.addLayer({
        id: 'orchard-outlines-line',
        type: 'line',
        source: 'orchard-outlines',
        paint: { 'line-color': '#7BE38B', 'line-width': 2, 'line-dasharray': [2, 1.5] },
      });
      m.addLayer({
        id: 'orchard-outlines-label',
        type: 'symbol',
        source: 'orchard-outlines',
        layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-font': ['Noto Sans Regular'] },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.6)',
          'text-halo-width': 1.2,
        },
      });
    };
    if (m.isStyleLoaded()) addOverlays();
    else m.once('load', addOverlays);
  }, [orchards]);

  // Draggable dot at the current point
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (!point) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const el = document.createElement('div');
      el.style.cssText =
        'width:22px;height:22px;border-radius:50%;background:#D9481C;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:grab;';
      const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
        .setLngLat([point.lng, point.lat])
        .addTo(m);
      marker.on('dragend', () => {
        const ll = marker.getLngLat();
        setPoint({ lng: ll.lng, lat: ll.lat });
        setLocSource('manual');
      });
      markerRef.current = marker;
      m.flyTo({ center: [point.lng, point.lat], zoom: Math.max(m.getZoom(), 18.5) });
    } else {
      markerRef.current.setLngLat([point.lng, point.lat]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.lng, point?.lat]);

  const handlePhoto = useCallback(async (file: File) => {
    setUploading(true);
    try {
      // EXIF GPS first — the photo knows where it was taken
      let gps: { latitude?: number; longitude?: number } | null = null;
      try {
        const exifr = (await import('exifr')).default;
        gps = await exifr.gps(file);
      } catch {
        /* no EXIF / unreadable — fall through to device GPS */
      }

      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const blob = await upload(`photos/discover/${Date.now()}.${ext}`, file, {
        access: 'public',
        handleUploadUrl: '/api/photos/upload',
      });
      setPhotoUrl(blob.url);

      if (gps?.latitude != null && gps?.longitude != null) {
        setPoint({ lng: gps.longitude, lat: gps.latitude });
        setLocSource('photo');
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setPoint({ lng: pos.coords.longitude, lat: pos.coords.latitude });
            setLocSource('device');
          },
          () => toast.info('No GPS in the photo or from the device — tap the map to place the dot'),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      } else {
        toast.info('No location available — tap the map to place the dot');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  }, []);

  const save = async () => {
    if (!point || !photoUrl || saving) return;
    setSaving(true);
    try {
      let orchardId = containing?.id ?? null;
      if (!orchardId) {
        if (!newName.trim()) {
          toast.warning('Name the new orchard first');
          setSaving(false);
          return;
        }
        const res = await fetch('/api/orchards/create-point', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newName.trim(),
            location: newLocation.trim(),
            lat: point.lat,
            lng: point.lng,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Could not create orchard');
        orchardId = body.orchardId as string;
      }

      const tree = await createTree({
        orchard_id: orchardId,
        row_id: rowId.trim() || 'Found',
        position: position.trim() || foundPosition(),
        lat: point.lat,
        lng: point.lng,
        variety: variety.trim() || undefined,
        status: 'healthy',
      });
      await createTreeEvent(tree.tree_id, {
        event_type: 'observation',
        detail: 'Found-tree photo',
        photo_url: photoUrl,
      });
      setDone({ orchardId, treeId: tree.tree_id });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="relative h-dvh w-full bg-paper">
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Header */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-surface/95 rounded-xl shadow-lg px-4 py-2.5 flex items-center gap-3">
        <Link href="/" className="text-bark hover:text-ink" aria-label="Back to orchards">
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <div>
          <p className="text-sm font-semibold text-ink leading-tight">Found a tree</p>
          <p className="text-[11px] text-bark leading-tight">
            Photo → location → drag the dot to the exact spot
          </p>
        </div>
      </div>

      {/* Bottom sheet */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-surface border-t border-line shadow-2xl rounded-t-2xl pb-safe md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[440px] md:rounded-2xl md:bottom-4 md:border p-4 space-y-3">
        {done ? (
          <div className="space-y-3 text-center">
            <p className="text-sm font-semibold text-ink">Tree recorded 🌳</p>
            <p className="text-xs text-bark font-mono">{done.treeId}</p>
            <div className="flex gap-2">
              <Link
                href={`/orchard/${done.orchardId}?tree=${encodeURIComponent(done.treeId)}`}
                className="flex-1 h-11 inline-flex items-center justify-center rounded-md bg-canopy-600 text-white text-sm font-medium hover:bg-canopy-700"
              >
                Open on the map
              </Link>
              <Button
                variant="secondary"
                className="h-11"
                onClick={() => {
                  setDone(null);
                  setPhotoUrl(null);
                  setPoint(null);
                  setVariety('');
                  setPosition(foundPosition());
                  setNewName('');
                }}
              >
                Another
              </Button>
            </div>
          </div>
        ) : !photoUrl ? (
          <label className="flex h-16 items-center justify-center gap-2 rounded-xl bg-canopy-600 text-white font-semibold cursor-pointer hover:bg-canopy-700 active:scale-[0.99]">
            {uploading ? <Loader2 className="animate-spin" size={20} aria-hidden /> : <Camera size={20} aria-hidden />}
            {uploading ? 'Uploading…' : 'Take a photo of the tree'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePhoto(f);
              }}
            />
          </label>
        ) : !point ? (
          <p className="text-sm text-bark text-center py-2">
            <MapPin className="inline mr-1" size={15} aria-hidden />
            Tap the map where this tree stands.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="Found tree" className="h-14 w-14 rounded-lg object-cover border border-line" />
              <div className="text-xs text-bark">
                <p className="font-medium text-ink">
                  {containing ? `Inside ${containing.name}` : 'Not in any known orchard'}
                </p>
                <p>
                  Location from {locSource === 'photo' ? 'photo GPS' : locSource === 'device' ? 'device GPS' : 'the map'} — drag the dot to fine-tune.
                </p>
              </div>
            </div>

            {containing ? (
              <div className="grid grid-cols-3 gap-2">
                <Input value={rowId} onChange={(e) => setRowId(e.target.value)} placeholder="Row/Block" className="h-10" />
                <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Position" className="h-10" />
                <Input value={variety} onChange={(e) => setVariety(e.target.value)} placeholder="Variety?" className="h-10" />
              </div>
            ) : (
              <div className="space-y-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New orchard name (e.g. Miller Road Wild Apple)" className="h-10" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Location (optional)" className="h-10" />
                  <Input value={variety} onChange={(e) => setVariety(e.target.value)} placeholder="Variety?" className="h-10" />
                </div>
              </div>
            )}

            <Button className="w-full h-12" onClick={save} disabled={saving}>
              {saving
                ? 'Saving…'
                : containing
                  ? `Add tree to ${containing.name}`
                  : 'Create orchard + add tree'}
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
