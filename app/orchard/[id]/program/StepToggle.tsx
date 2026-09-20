'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

/**
 * Whether this orchard runs this step.
 *
 * The steps themselves are regional agronomy and shared; opting out of
 * one is a local decision, so it is a per-orchard setting rather than
 * an edit to the program. A step switched off keeps its history — turn
 * it back on and last season's completions are still there.
 */
export default function StepToggle({
  orchardId,
  stepKey,
  enabled,
  title,
}: {
  orchardId: string;
  stepKey: string;
  enabled: boolean;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await trpc.program.setEnabled.mutate({ orchardId, stepKey, enabled: !enabled });
      toast.success(enabled ? `${title} switched off` : `${title} switched on`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change that');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`${title} — ${enabled ? 'on' : 'off'}`}
      onClick={toggle}
      disabled={busy}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        enabled ? 'bg-canopy-600' : 'bg-line'
      }`}
    >
      <span
        aria-hidden
        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface shadow transition-transform ${
          enabled ? 'translate-x-[1.125rem]' : 'translate-x-1'
        }`}
      >
        {busy && <Loader2 size={9} className="animate-spin text-bark" aria-hidden />}
      </span>
    </button>
  );
}
