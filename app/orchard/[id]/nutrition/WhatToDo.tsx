'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { LEAF_SUFFICIENCY, type Nutrient } from '@/lib/nutrition';
import type { NutrientAdvice } from '@/lib/db/nutrient-advice';

/**
 * What to do about the readings that are out of range.
 *
 * The same shape as the IPM side: advice arrives with where it came from,
 * and becomes a step the orchard owns only when somebody accepts it.
 *
 * Where nothing is recorded, this says so plainly instead of filling the
 * space. A nutrient rate is the kind of number that damages fruit when it
 * is wrong — and this app already carries a note that the YAN figure
 * everyone quotes for cider is really a wine standard. Silence is the
 * honest output until there is a source worth citing.
 */
export default function WhatToDo({
  orchardId,
  problems,
  advice,
  canEdit,
}: {
  orchardId: string;
  problems: Array<{ nutrient: Nutrient; verdict: string }>;
  advice: Record<string, NutrientAdvice>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  if (problems.length === 0) return null;

  async function accept(a: NutrientAdvice) {
    setBusy(a.id);
    try {
      await trpc.nutrition.acceptAdvice.mutate({ orchardId, adviceId: a.id });
      toast.success(`Added "${a.title}" to your program. Retime it there if it needs it.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add that to the program');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-5 rounded-xl border border-line bg-surface p-4">
      <h2 className="survey-caption mb-2">What to do about it</h2>

      <ul className="divide-y divide-line">
        {problems.map((p) => {
          const a = advice[p.nutrient];
          const label = LEAF_SUFFICIENCY[p.nutrient].label;

          if (!a) {
            return (
              <li key={p.nutrient} className="py-3">
                <p className="text-sm text-ink">
                  {label} is {p.verdict}
                </p>
                <p className="mt-0.5 text-sm text-bark">
                  No recommendation is recorded for this. Rather than print a rate from
                  nowhere, the app says nothing — check your extension service, and if you
                  want it kept, it can be added here with its source.
                </p>
              </li>
            );
          }

          return (
            <li key={p.nutrient} className="py-3">
              <p className="text-sm font-medium text-ink">{a.title}</p>
              {a.detail && <p className="mt-0.5 text-sm text-bark">{a.detail}</p>}

              {a.rateLow != null && (
                <p className="mt-1 font-mono text-xs text-ink">
                  {a.rateLow}
                  {a.rateHigh != null && a.rateHigh !== a.rateLow ? `–${a.rateHigh}` : ''}{' '}
                  {a.rateUnit}
                </p>
              )}

              <p className="mt-1 text-xs text-bark">
                <span className="font-mono text-[10px] uppercase tracking-widest">
                  {a.confidence} confidence
                </span>
                {a.regional ? ' · specific to your region' : ' · general advice'}
                {a.source && ` · ${a.source}`}
              </p>
              {a.quote && <p className="mt-0.5 text-xs text-bark italic">&ldquo;{a.quote}&rdquo;</p>}
              {a.url && (
                <a href={a.url} target="_blank" rel="noreferrer" className="text-xs text-canopy-700 dark:text-canopy-100 hover:underline">
                  source
                </a>
              )}

              {canEdit && (
                <button
                  onClick={() => accept(a)}
                  disabled={busy === a.id}
                  className="mt-2 px-3 py-1.5 rounded-md text-sm font-medium bg-canopy-600 text-white hover:bg-canopy-700 disabled:opacity-50"
                >
                  {busy === a.id ? 'Adding…' : 'Add to my program'}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-bark">
        Anything you add becomes your own step in the{' '}
        <Link href={`/orchard/${orchardId}/program`} className="text-canopy-700 dark:text-canopy-100 hover:underline">
          program
        </Link>
        , where you can retime it, change the material or remove it.
      </p>
    </section>
  );
}
