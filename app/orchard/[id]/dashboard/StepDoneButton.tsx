'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';

/**
 * "Did that." Records the step as done today, which is what takes it
 * off this card — once for the season, or until a recurring step's
 * interval is up. A spray recorded on the spray page completes its step
 * on its own, so this is for the work that isn't a spray.
 */
export default function StepDoneButton({
  orchardId,
  stepKey,
  today,
}: {
  orchardId: string;
  stepKey: string;
  today: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const done = async () => {
    setSaving(true);
    try {
      await trpc.program.complete.mutate({ orchardId, stepKey, completedOn: today });
      toast.success('Marked done');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record that');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Button size="sm" variant="secondary" onClick={done} disabled={saving} className="shrink-0">
      {saving ? (
        <Loader2 size={14} className="animate-spin" aria-hidden />
      ) : (
        <Check size={14} aria-hidden />
      )}
      Done
    </Button>
  );
}
