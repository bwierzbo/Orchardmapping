'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface GeocodeHit {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Start an orchard from a street address: search (OSM geocoder), land
 * on the satellite map, refine the pin by dragging or tapping, then
 * create a point-orchard there. The boundary, Detect Trees, and every
 * other tool takes over from the orchard map.
 */
export default function NewOrchardFromAddressPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<GeocodeHit[] | null>(null);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace('/login');
  }, [isLoaded, isSignedIn, router]);

  // Stable across renders (touches only refs and setState), so the
  // map's click handler can bind it once at init.
  const placePin = useCallback((lng: number, lat: number, fly: boolean) => {
    const m = mapRef.current;
    if (!m) return;
    if (!markerRef.current) {
      const el = document.createElement('div');
      el.style.cssText =
        'width:22px;height:22px;border-radius:50%;background:#2F6B3C;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:grab;';
      const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(m);
      marker.on('dragend', () => {
        const ll = marker.getLngLat();
        setPoint({ lat: ll.lat, lng: ll.lng });
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }
    setPoint({ lat, lng });
    if (fly) m.flyTo({ center: [lng, lat], zoom: 17.5 });
  }, []);

  // ---- map lifecycle (world imagery) ----
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution:
              'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
          },
        },
        layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
      },
      center: [-98, 39],
      zoom: 3,
      maxZoom: 21,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('click', (e) => placePin(e.lngLat.lng, e.lngLat.lat, false));
    mapRef.current = m;
    return () => {
      m.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [placePin]);

  const search = async () => {
    if (address.trim().length < 3 || searching) return;
    setSearching(true);
    setHits(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(address.trim())}`, {
        credentials: 'include',
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Address search failed');
      const results: GeocodeHit[] = body.results ?? [];
      setHits(results);
      if (results.length === 0) {
        toast.info('No matches — try adding the town or ZIP');
      } else {
        placePin(results[0].lng, results[0].lat, true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Address search failed');
    } finally {
      setSearching(false);
    }
  };

  const create = async () => {
    if (!name.trim() || !point || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/orchards/create-point', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          location: address.trim() || 'Discovered location',
          lat: point.lat,
          lng: point.lng,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to create orchard');
      toast.success(`${name.trim()} created — draw the boundary or Detect Trees next`);
      router.push(`/orchard/${body.orchardId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create orchard');
      setCreating(false);
    }
  };

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-paper">
        <Loader2 aria-hidden size={24} className="animate-spin text-bark" />
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-paper flex flex-col">
      <div className="max-w-2xl w-full mx-auto px-5 pt-6 pb-3">
        <Link
          href="/orchards/new"
          className="inline-flex items-center gap-1.5 text-sm text-bark hover:text-ink mb-4"
        >
          <ArrowLeft aria-hidden size={16} /> Add an orchard
        </Link>
        <h1 className="font-display text-2xl font-semibold text-ink">Start from an address</h1>
        <p className="text-bark mt-1 text-sm">
          Search the address, then drag the pin (or tap the map) onto the orchard itself.
        </p>

        <div className="mt-4 grid gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Orchard name"
          />
          <div className="flex gap-2">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') search();
              }}
              placeholder="Address (e.g. 1027 Finn Hall Rd, Port Angeles WA)"
            />
            <Button onClick={search} disabled={searching || address.trim().length < 3}>
              {searching ? (
                <Loader2 aria-hidden size={15} className="animate-spin" />
              ) : (
                <Search aria-hidden size={15} />
              )}
              <span className="sr-only sm:not-sr-only sm:ml-1.5">Search</span>
            </Button>
          </div>
          {hits && hits.length > 1 && (
            <ul className="border border-line rounded-md bg-surface divide-y divide-line max-h-36 overflow-y-auto">
              {hits.map((h, i) => (
                <li key={i}>
                  <button
                    onClick={() => placePin(h.lng, h.lat, true)}
                    className="w-full text-left px-3 py-2 text-xs text-ink hover:bg-canopy-50 flex items-start gap-1.5"
                  >
                    <MapPin aria-hidden size={13} className="mt-0.5 shrink-0 text-canopy-600" />
                    {h.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="relative flex-1 min-h-72 mx-5 mb-3 max-w-2xl w-auto sm:mx-auto sm:w-full rounded-lg overflow-hidden border border-line">
        <div ref={mapContainer} className="absolute inset-0" />
      </div>

      <div className="max-w-2xl w-full mx-auto px-5 pb-6 pb-safe">
        <Button className="w-full h-11" onClick={create} disabled={creating || !name.trim() || !point}>
          {creating ? 'Creating…' : point ? 'Create orchard at the pin' : 'Search or tap the map to place the pin'}
        </Button>
        <p className="mt-2 text-xs text-bark text-center">
          Next: from the orchard map, draw the boundary (Areas) and run Detect Trees.
        </p>
      </div>
    </main>
  );
}
