'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import {
  FRUIT_PURPOSES, FRUIT_PURPOSE_LABEL,
  OPERATION_SCALES, OPERATION_SCALE_LABEL,
  type FruitPurpose, type OperationScale,
} from '@/lib/nutrition';

/**
 * What the orchard is for.
 *
 * Kept on the nutrition page because that is where it currently
 * changes anything — but it is an orchard-level fact, not a nutrition
 * setting, and other parts of the programme have the same distinction
 * baked in as an assumption. The pest library already assumes cider
 * when it calls russet and mild scab ignorable.
 */
export default function IntentPicker({
  orchardId,
  intent,
}: {
  orchardId: string;
  intent: { fruitPurpose: FruitPurpose; operationScale: OperationScale };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const save = async (patch: {
    fruitPurpose?: FruitPurpose;
    operationScale?: OperationScale;
  }) => {
    setBusy(true);
    try {
      await trpc.nutrition.setIntent.mutate({ orchardId, ...patch });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save that');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap gap-3">
      <div>
        <label className="block text-xs text-bark mb-1" htmlFor="fruit-purpose">
          Fruit is for
        </label>
        <select
          id="fruit-purpose"
          value={intent.fruitPurpose}
          disabled={busy}
          onChange={(e) => save({ fruitPurpose: e.target.value as FruitPurpose })}
          className="h-9 px-2 bg-paper text-ink border border-line rounded-md text-sm disabled:opacity-50"
        >
          {FRUIT_PURPOSES.map((p) => (
            <option key={p} value={p}>{FRUIT_PURPOSE_LABEL[p]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-bark mb-1" htmlFor="operation-scale">
          Scale
        </label>
        <select
          id="operation-scale"
          value={intent.operationScale}
          disabled={busy}
          onChange={(e) => save({ operationScale: e.target.value as OperationScale })}
          className="h-9 px-2 bg-paper text-ink border border-line rounded-md text-sm disabled:opacity-50"
        >
          {OPERATION_SCALES.map((s) => (
            <option key={s} value={s}>{OPERATION_SCALE_LABEL[s]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
