'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * The definition of a field, on the field's own label.
 *
 * A scale like "starch 1-8" or "seed colour 0-2" is unusable from
 * memory, and the person reading it is standing under a tree rather
 * than next to the Cornell chart. Hover on a desktop, tap on a phone —
 * a tooltip that only appears on hover is no tooltip at all to somebody
 * holding a fruit in one hand.
 */
export default function FieldHelp({ summary, scale }: { summary: string; scale?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={open ? 'Hide explanation' : 'What is this?'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        // Big enough to hit with a thumb, without pushing the label around.
        className="p-1 -m-1 text-bark/60 hover:text-ink"
      >
        <HelpCircle aria-hidden size={13} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-line bg-surface p-2.5 text-left shadow-lg"
        >
          <span className="block text-xs font-normal normal-case tracking-normal text-ink">
            {summary}
          </span>
          {scale && (
            <span className="mt-1.5 block text-xs font-normal normal-case tracking-normal text-bark">
              {scale}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
