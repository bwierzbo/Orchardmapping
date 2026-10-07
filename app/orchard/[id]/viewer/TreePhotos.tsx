'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { fetchTreeEvents, type ClientTreeEvent } from '@/lib/api/trees';
import { photosFromEvents, type TreePhoto } from '@/lib/tree-photos';
import { formatYMD } from '@/lib/dates';

/**
 * Every photograph of one tree, newest first.
 *
 * The history already shows each photo beside the event it was taken for,
 * which answers "what did this inspection find". It cannot answer "how has
 * this tree changed", because the photos are strung out between pruning
 * notes and fruit checks. A tree's photographs are a series and want to be
 * read as one.
 */

const LABEL: Record<string, string> = {
  observation: 'Observation',
  fruit_check: 'Fruit check',
  bloom: 'Bloom stage',
  tree_condition: 'Trunk and scaffolds',
  harvest_readiness: 'Picking verdict',
  harvest: 'Harvest',
  pruning: 'Pruned',
  spray: 'Sprayed',
  fertilize: 'Fertilized',
  note: 'Note',
};

function caption(photo: TreePhoto): string {
  const when = photo.date ? formatYMD(photo.date) : 'undated';
  return `${when} · ${LABEL[photo.eventType] ?? photo.eventType}`;
}

export default function TreePhotos({
  treeId,
  refreshKey,
}: {
  treeId: string;
  refreshKey?: number;
}) {
  const [photos, setPhotos] = useState<TreePhoto[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  // Reads the events the history already serves rather than a photo
  // endpoint of its own: a photo IS an event here, and a second source for
  // the same rows is a second thing to keep true.
  useEffect(() => {
    let cancelled = false;
    fetchTreeEvents(treeId)
      .then((events: ClientTreeEvent[]) => {
        if (!cancelled) setPhotos(photosFromEvents(events));
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [treeId, refreshKey]);

  // Arrow keys and Escape, because a lightbox that traps the keyboard is
  // worse than no lightbox.
  useEffect(() => {
    if (open === null || !photos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? null : Math.min(i + 1, photos.length - 1)));
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? null : Math.max(i - 1, 0)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, photos]);

  if (photos === null || photos.length === 0) return null;

  const current = open === null ? null : photos[open];

  return (
    <div className="mt-3">
      <p className="text-sm text-bark mb-1.5">
        Photos <span className="font-mono text-xs">{photos.length}</span>
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {photos.map((p, i) => (
          <button
            key={p.url}
            type="button"
            onClick={() => setOpen(i)}
            title={caption(p)}
            className="relative aspect-square overflow-hidden rounded-md border border-line hover:ring-2 hover:ring-canopy-600"
          >
            <Image
              src={p.url}
              alt={caption(p)}
              fill
              sizes="80px"
              className="object-cover"
              unoptimized
            />
          </button>
        ))}
      </div>

      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photo of this tree, ${caption(current)}`}
          className="fixed inset-0 z-50 flex flex-col bg-black/90"
          onClick={() => setOpen(null)}
        >
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="text-sm">
              {caption(current)}
              {current.detail ? ` — ${current.detail}` : ''}
            </span>
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label="Close photo"
              className="p-2 -m-2"
            >
              <X aria-hidden size={20} />
            </button>
          </div>

          {/* Stops a tap on the picture itself from closing the viewer. */}
          <div
            className="relative flex-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={current.url}
              alt={caption(current)}
              fill
              sizes="100vw"
              className="object-contain"
              unoptimized
            />
          </div>

          <div
            className="flex items-center justify-between px-4 py-4 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen((i) => (i === null ? null : Math.max(i - 1, 0)))}
              disabled={open === 0}
              aria-label="Newer photo"
              className="p-2 disabled:opacity-30"
            >
              <ChevronLeft aria-hidden size={24} />
            </button>
            <span className="font-mono text-xs">
              {open! + 1} / {photos.length}
            </span>
            <button
              type="button"
              onClick={() =>
                setOpen((i) => (i === null ? null : Math.min(i + 1, photos.length - 1)))
              }
              disabled={open === photos.length - 1}
              aria-label="Older photo"
              className="p-2 disabled:opacity-30"
            >
              <ChevronRight aria-hidden size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
