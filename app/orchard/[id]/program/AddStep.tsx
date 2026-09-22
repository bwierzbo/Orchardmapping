'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import StepEditor from './StepEditor';

/** Write a step nobody recommended — a fence, a block, a local habit. */
export default function AddStep({ orchardId }: { orchardId: string }) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div className="mb-3">
        <StepEditor orchardId={orchardId} onDone={() => setOpen(false)} />
      </div>
    );
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className="mb-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-surface border border-line text-ink hover:bg-canopy-50"
    >
      <Plus size={14} aria-hidden />
      Add a step of your own
    </button>
  );
}
