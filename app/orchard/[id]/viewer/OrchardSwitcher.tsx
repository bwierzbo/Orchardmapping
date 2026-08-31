'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrchardConfig } from '@/lib/types';

interface OrchardSwitcherProps {
  orchards: OrchardConfig[];
  currentId: string;
  /** Destination page for a picked orchard (serializable across RSC boundary). */
  target?: 'map' | 'dashboard';
}

export default function OrchardSwitcher({
  orchards,
  currentId,
  target = 'map',
}: OrchardSwitcherProps) {
  const hrefFor = (id: string) =>
    target === 'dashboard' ? `/orchard/${id}/dashboard` : `/orchard/${id}`;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (orchards.length < 2) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-canopy-600 text-white text-sm font-medium rounded-lg hover:bg-canopy-700"
      >
        Switch Orchard
        <svg aria-hidden className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute top-full right-0 mt-2 min-w-[240px] max-w-[80vw] bg-surface rounded-xl shadow-xl border border-line py-1 z-30"
        >
          {orchards.map((o) => (
            <li key={o.id}>
              <button
                role="option"
                aria-selected={o.id === currentId}
                onClick={() => {
                  setOpen(false);
                  if (o.id !== currentId) router.push(hrefFor(o.id));
                }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-canopy-50 ${
                  o.id === currentId ? 'font-semibold text-canopy-700' : 'text-ink'
                }`}
              >
                <span className="block">{o.name}</span>
                <span className="block text-xs text-bark">{o.location}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
