'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { PHENOLOGY_LABEL, type PhenologyStage } from '@/lib/phenology';
import { formatYMD } from '@/lib/dates';
import { Button } from '@/components/ui/button';

interface Suggestion {
  variety: string;
  stage: PhenologyStage;
  atOrPast: number;
  observed: number;
  reachedOn: string;
}

/**
 * "Your walk says Harrison is at pink — record it?"
 *
 * Walk mode records a bloom stage per tree, and that is the natural
 * moment to notice one: you are standing in front of the tree. This
 * turns those observations into the variety mark the programme reads,
 * so the walk drives the spray timing instead of sitting beside it.
 *
 * It asks rather than acting. The threshold is a convention, the trees
 * you happened to look at are a sample, and a grower who knows the
 * block may disagree — so this is a prompt with the evidence attached,
 * not an automatic write.
 */
export default function RollUpPrompt({
  orchardId,
  suggestions,
}: {
  orchardId: string;
  suggestions: Suggestion[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const shown = suggestions.filter((s) => !dismissed.includes(s.variety + s.stage));
  if (shown.length === 0) return null;

  const accept = async (s: Suggestion) => {
    setBusy(s.variety + s.stage);
    try {
      await trpc.phenology.mark.mutate({
        orchardId,
        stage: s.stage,
        observedOn: s.reachedOn,
        scope: 'variety',
        scopeValue: s.variety,
        note: `From ${s.atOrPast} of ${s.observed} trees seen on the walk`,
      });
      toast.success(`${s.variety}: ${PHENOLOGY_LABEL[s.stage].toLowerCase()} recorded`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record that');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 border-l-2 border-canopy-600 pl-3">
      <p className="survey-caption">From your walk</p>
      <ul className="mt-1.5 space-y-2">
        {shown.map((s) => {
          const id = s.variety + s.stage;
          return (
            <li key={id} className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink flex-1 min-w-48">
                <strong>{s.variety}</strong> looks like{' '}
                {PHENOLOGY_LABEL[s.stage].toLowerCase()} —{' '}
                <span className="text-bark">
                  {s.atOrPast} of {s.observed} trees you checked, by{' '}
                  {formatYMD(s.reachedOn)}
                </span>
              </span>
              <Button size="sm" onClick={() => accept(s)} disabled={busy === id}>
                {busy === id ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <Check size={14} aria-hidden />
                )}
                Record it
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDismissed((d) => [...d, id])}
                disabled={busy === id}
              >
                Not yet
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
