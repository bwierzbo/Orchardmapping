'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';

/**
 * The advice for a step you already adopted has changed.
 *
 * Shown, never applied. An adopted step is a copy, and copies do not hear
 * about corrections — the copper re-entry interval in this repo was once
 * wrong by half, and an orchard that had adopted it would never have
 * learnt otherwise. But the orchard's version may be deliberate, so the
 * choice stays with the grower and asking twice is avoided either way.
 */
export default function RevisionNotice({
  orchardId,
  steps,
}: {
  orchardId: string;
  steps: Array<{ key: string; title: string; customised: boolean }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  if (steps.length === 0) return null;

  async function resolve(key: string, choice: 'accept' | 'keep', title: string) {
    setBusy(key);
    try {
      await trpc.program2.resolveRevision.mutate({ orchardId, key, choice });
      toast.success(
        choice === 'accept'
          ? `"${title}" updated to the current advice.`
          : `Keeping your version of "${title}".`
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not resolve that');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-4 rounded-xl border border-flag-600/30 bg-flag-600/5 p-4">
      <h2 className="text-sm font-medium text-ink">
        The advice changed for {steps.length} step{steps.length === 1 ? '' : 's'}
      </h2>
      <p className="mt-1 text-sm text-bark">
        These were revised after you adopted them. Nothing has been changed in your program —
        take the new advice or keep what you have.
      </p>
      <ul className="mt-3 space-y-2">
        {steps.map((s) => (
          <li key={s.key} className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink flex-1 min-w-0">
              {s.title}
              {s.customised && (
                <span className="ml-1.5 text-xs text-bark">— you had changed this one</span>
              )}
            </span>
            <button
              onClick={() => resolve(s.key, 'accept', s.title)}
              disabled={busy === s.key}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-canopy-600 text-white hover:bg-canopy-700 disabled:opacity-50"
            >
              Take the new advice
            </button>
            <button
              onClick={() => resolve(s.key, 'keep', s.title)}
              disabled={busy === s.key}
              className="px-2.5 py-1 rounded-md text-xs font-medium text-ink border border-line hover:bg-canopy-50 disabled:opacity-50"
            >
              Keep mine
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
