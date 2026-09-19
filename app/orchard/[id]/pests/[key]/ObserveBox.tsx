'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { upload } from '@vercel/blob/client';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { downscaleImage, photoExtension } from '@/lib/image-resize';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Observation {
  id: number;
  photo_url: string | null;
  severity: string | null;
  observed_at: string;
  notes: string | null;
}

const SEVERITIES = ['light', 'moderate', 'severe'] as const;

/**
 * "I found this" — logs a sighting with a photo against this library
 * entry. Over a season these become the orchard's OWN reference images,
 * which beat stock photography for telling look-alikes apart, and they
 * double as the scouting record.
 */
export default function ObserveBox({
  orchardId,
  pestKey,
  pestName,
  initial,
}: {
  orchardId: string;
  pestKey: string;
  pestName: string;
  initial: Observation[];
}) {
  const [observations, setObservations] = useState<Observation[]>(initial);
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('moderate');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const rows = await trpc.pest.observations.query({ orchardId, pestKey });
    setObservations(rows as Observation[]);
  }, [orchardId, pestKey]);

  const save = async (photoUrl?: string) => {
    setBusy(true);
    try {
      await trpc.pest.observe.mutate({
        orchardId,
        pestKey,
        severity,
        notes: notes || undefined,
        photoUrl,
      });
      setNotes('');
      await reload();
      toast.success(`Logged ${pestName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not log sighting');
    } finally {
      setBusy(false);
    }
  };

  const withPhoto = async (file: File) => {
    setBusy(true);
    try {
      const small = await downscaleImage(file);
      const blob = await upload(
        `photos/pests/${pestKey}/${Date.now()}.${photoExtension(small)}`,
        small,
        {
          access: 'public',
          handleUploadUrl: '/api/photos/upload',
        },
      );
      await save(blob.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Photo upload failed');
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await trpc.pest.deleteObservation.mutate({ id });
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove');
    }
  };

  return (
    <section className="bg-surface border border-line rounded-lg p-4">
      <h2 className="font-display text-lg text-ink">Seen it here?</h2>
      <p className="text-sm text-bark mt-0.5">
        Log a sighting with a photo. These build your own reference gallery for this
        one, and count as scouting records.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-bark mb-1">Severity</label>
          <div className="flex gap-1">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium border capitalize ${
                  severity === s
                    ? 'bg-canopy-600 text-white border-canopy-600'
                    : 'bg-surface text-bark border-line hover:bg-canopy-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-bark mb-1">Notes (optional)</label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Row 4, worst on the north end"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 px-3 h-10 rounded-md bg-canopy-600 text-white text-sm font-medium cursor-pointer hover:bg-canopy-700">
          {busy ? (
            <Loader2 size={15} className="animate-spin" aria-hidden />
          ) : (
            <Camera size={15} aria-hidden />
          )}
          Photo
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) withPhoto(f);
              e.target.value = '';
            }}
          />
        </label>
        <Button variant="secondary" onClick={() => save()} disabled={busy}>
          Log without photo
        </Button>
      </div>

      {observations.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-mono uppercase tracking-widest text-bark mb-2">
            Your sightings
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {observations.map((o) => (
              <li
                key={o.id}
                className="flex items-start gap-2 border border-line rounded-md p-2"
              >
                {o.photo_url ? (
                  <a href={o.photo_url} target="_blank" rel="noreferrer" className="shrink-0">
                    <Image
                      src={o.photo_url}
                      alt={`${pestName} sighting`}
                      width={64}
                      height={64}
                      className="h-16 w-16 rounded object-cover border border-line"
                    />
                  </a>
                ) : (
                  <div className="h-16 w-16 rounded bg-paper border border-line shrink-0" />
                )}
                <div className="min-w-0 flex-1 text-xs">
                  <p className="text-ink font-medium capitalize">{o.severity ?? 'logged'}</p>
                  <p className="text-bark">{new Date(o.observed_at).toLocaleDateString()}</p>
                  {o.notes && <p className="text-bark/80 mt-0.5">{o.notes}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => remove(o.id)}
                  className="text-bark hover:text-destructive p-1"
                  aria-label="Remove sighting"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
