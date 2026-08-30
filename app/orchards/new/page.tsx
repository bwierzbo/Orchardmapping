'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { upload } from '@vercel/blob/client';
import { PMTiles, FileSource } from 'pmtiles';
import Link from 'next/link';
import { ArrowLeft, FileUp, Loader2, TriangleAlert } from 'lucide-react';

interface Preflight {
  ok: boolean;
  message: string;
  bounds?: string;
  zooms?: string;
  type?: string;
}

/** PMTiles spec tile types: 0 unknown, 1 MVT, 2 PNG, 3 JPEG, 4 WEBP, 5 AVIF */
function tileTypeLabel(t: number): string {
  return t === 1 ? 'vector (MVT)' : t >= 2 && t <= 5 ? 'raster imagery' : 'unknown';
}

export default function NewOrchardPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'creating'>('idle');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/login');
    }
  }, [isLoaded, isSignedIn, router]);

  const inspect = useCallback(async (f: File) => {
    setFile(f);
    setPreflight(null);
    if (!f.name.toLowerCase().endsWith('.pmtiles')) {
      setPreflight({ ok: false, message: 'Not a .pmtiles file. Export PMTiles from QGIS or the pmtiles CLI.' });
      return;
    }
    try {
      const pm = new PMTiles(new FileSource(f));
      const header = await pm.getHeader();
      const world =
        header.minLon <= -180 && header.maxLon >= 180 && header.minLat <= -85 && header.maxLat >= 85;
      setPreflight({
        ok: true,
        message: world
          ? 'Header has world bounds — georeferencing may be broken. The map may not line up.'
          : 'Archive looks good.',
        bounds: `${header.minLon.toFixed(5)}, ${header.minLat.toFixed(5)} → ${header.maxLon.toFixed(5)}, ${header.maxLat.toFixed(5)}`,
        zooms: `z${header.minZoom}–z${header.maxZoom}`,
        type: tileTypeLabel(header.tileType),
      });
    } catch {
      setPreflight({ ok: false, message: 'Could not read the PMTiles header — the file may be corrupt.' });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) return setError('Orchard name is required');
    if (!location.trim()) return setError('Location is required');
    if (!file) return setError('A PMTiles file is required');
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) return setError('Orchard name must contain letters or numbers');

    try {
      setPhase('uploading');
      setProgress(0);
      const blob = await upload(`orchards/${slug}/ortho/orthomap.pmtiles`, file, {
        access: 'public',
        handleUploadUrl: '/api/orchards/upload',
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });

      setPhase('creating');
      const response = await fetch('/api/orchards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), location: location.trim(), blobUrl: blob.url }),
        credentials: 'include',
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create orchard');
      }
      router.push(`/orchard/${result.orchardId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setPhase('idle');
      setProgress(0);
    }
  };

  const busy = phase !== 'idle';

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-paper">
        <Loader2 aria-hidden size={24} className="animate-spin text-bark" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto px-5 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-bark hover:text-ink mb-6"
        >
          <ArrowLeft aria-hidden size={16} /> All orchards
        </Link>

        <h1 className="font-display text-3xl font-semibold text-ink">Add a new orchard</h1>
        <p className="text-bark mt-2 text-sm max-w-lg">
          Upload the orthomosaic as a PMTiles archive. Export one from OpenDroneMap or QGIS
          (GeoTIFF → MBTiles → <code className="font-mono text-xs">pmtiles convert</code>).
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="bg-status-dead/10 border border-status-dead/30 text-status-dead px-3.5 py-2.5 rounded-md text-sm"
            >
              {error}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-xs font-medium text-bark mb-1.5">
                Orchard name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                placeholder="South Slope Orchard"
                className="w-full px-3.5 py-2 bg-surface text-ink border border-line rounded-md focus:ring-2 focus:ring-canopy-600 focus:border-transparent outline-none disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="location" className="block text-xs font-medium text-bark mb-1.5">
                Location
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={busy}
                placeholder="Sequim, WA"
                className="w-full px-3.5 py-2 bg-surface text-ink border border-line rounded-md focus:ring-2 focus:ring-canopy-600 focus:border-transparent outline-none disabled:opacity-60"
              />
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) inspect(f);
            }}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-base ${
              dragging ? 'border-canopy-600 bg-canopy-50' : 'border-line bg-surface'
            }`}
          >
            <FileUp aria-hidden className="mx-auto text-canopy-600" size={28} />
            <p className="mt-3 text-sm text-ink font-medium">
              {file ? file.name : 'Drag and drop your .pmtiles file here'}
            </p>
            <p className="text-xs text-bark mt-1">
              {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'or'}
            </p>
            {!file && (
              <label className="inline-block mt-2 px-4 py-2 bg-canopy-600 text-white dark:text-paper text-sm font-medium rounded-md hover:bg-canopy-700 cursor-pointer">
                Choose file
                <input
                  type="file"
                  accept=".pmtiles"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) inspect(f);
                  }}
                />
              </label>
            )}
            {file && !busy && (
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setPreflight(null);
                }}
                className="mt-2 text-xs text-bark hover:text-ink underline underline-offset-2"
              >
                Choose a different file
              </button>
            )}
          </div>

          {preflight && (
            <div
              className={`rounded-md border px-4 py-3 text-sm ${
                preflight.ok
                  ? 'border-line bg-surface'
                  : 'border-status-dead/30 bg-status-dead/10 text-status-dead'
              }`}
            >
              <p className={`flex items-center gap-2 font-medium ${preflight.ok ? 'text-ink' : ''}`}>
                {!preflight.ok || preflight.message !== 'Archive looks good.' ? (
                  <TriangleAlert aria-hidden size={15} className="text-status-stressed" />
                ) : null}
                {preflight.message}
              </p>
              {preflight.ok && (
                <dl className="mt-2 font-mono text-[11px] text-bark space-y-0.5">
                  <div>bounds: {preflight.bounds}</div>
                  <div>
                    zooms: {preflight.zooms} · tiles: {preflight.type}
                  </div>
                </dl>
              )}
            </div>
          )}

          {busy && (
            <div>
              <div className="flex justify-between text-xs text-bark mb-1.5">
                <span>
                  {phase === 'uploading' ? 'Uploading to storage…' : 'Reading tiles & creating orchard…'}
                </span>
                {phase === 'uploading' && <span className="font-mono">{progress}%</span>}
              </div>
              <div className="h-2 bg-line rounded-full overflow-hidden">
                <div
                  className={`h-full bg-canopy-600 rounded-full transition-all duration-base ${
                    phase === 'creating' ? 'animate-pulse w-full' : ''
                  }`}
                  style={phase === 'uploading' ? { width: `${progress}%` } : undefined}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Link
              href="/"
              className="px-4 py-2.5 text-sm rounded-md bg-surface border border-line text-ink hover:bg-canopy-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={busy || !file}
              className="px-5 py-2.5 bg-canopy-600 text-white dark:text-paper text-sm font-medium rounded-md hover:bg-canopy-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {busy && <Loader2 aria-hidden size={15} className="animate-spin" />}
              Create orchard
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
