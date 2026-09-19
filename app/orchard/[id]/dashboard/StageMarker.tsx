'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { PHENOLOGY_HELP, PHENOLOGY_LABEL, type PhenologyStage } from '@/lib/phenology';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Records the date the block reached a growth stage. Defaults to the
 * next unrecorded stage and to today, because that is the overwhelmingly
 * common case: you notice green tip while you are standing in the row.
 * The date stays editable for the evening you remember it was Tuesday.
 */
export default function StageMarker({
  orchardId,
  stages,
  today,
}: {
  orchardId: string;
  stages: PhenologyStage[];
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<PhenologyStage>(stages[0]);
  const [observedOn, setObservedOn] = useState(today);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await trpc.phenology.mark.mutate({ orchardId, stage, observedOn });
      toast.success(`${PHENOLOGY_LABEL[stage]} recorded`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record the stage');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Mark a stage
      </Button>
    );
  }

  return (
    <div className="w-full sm:w-auto sm:min-w-72 border border-line rounded-md p-3 bg-paper">
      <Label className="text-xs">Stage reached</Label>
      <select
        value={stage}
        onChange={(e) => setStage(e.target.value as PhenologyStage)}
        className="w-full h-10 px-3 bg-surface text-ink border border-line rounded-md text-sm"
      >
        {stages.map((s) => (
          <option key={s} value={s}>
            {PHENOLOGY_LABEL[s]}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-bark mt-1">{PHENOLOGY_HELP[stage]}</p>

      <Label className="text-xs mt-2 block">On</Label>
      <Input
        type="date"
        value={observedOn}
        max={today}
        onChange={(e) => setObservedOn(e.target.value)}
      />

      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 size={14} className="animate-spin mr-1.5" aria-hidden />}
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
