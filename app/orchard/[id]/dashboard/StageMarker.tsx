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
 * Recording a growth stage: everything at once, then the stragglers.
 *
 * A block of eighteen varieties arrives within a few days, so marking
 * them one at a time would be accurate and nobody would do it. The
 * default is all of them on today's date and the work is in naming the
 * two or three that are behind — which is also how you would say it out
 * loud: "everything's at green tip except Harrison."
 *
 * A stage belongs to a GROUP, not to every tree in it. Full bloom is
 * defined as 70 to 80% of blossoms open, so a few trees ahead or behind
 * is expected rather than a problem to reconcile — the help text says
 * so at the moment of choosing.
 */
export default function StageMarker({
  orchardId,
  stages,
  today,
  varieties,
}: {
  orchardId: string;
  stages: PhenologyStage[];
  today: string;
  /** Every variety in the block. Empty falls back to one orchard mark. */
  varieties: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<PhenologyStage>(stages[0]);
  const [observedOn, setObservedOn] = useState(today);
  const [behind, setBehind] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const byVariety = varieties.length > 0;
  const laggards = Object.keys(behind);

  const toggleBehind = (v: string) => {
    setBehind((b) => {
      const next = { ...b };
      if (v in next) delete next[v];
      else next[v] = '';
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      if (byVariety) {
        const { marked } = await trpc.phenology.markAll.mutate({
          orchardId,
          stage,
          observedOn,
          groups: varieties,
          scope: 'variety',
          exceptions: Object.entries(behind).map(([group, on]) => ({
            group,
            // Blank means "not there yet" — skipped rather than guessed
            observedOn: on === '' ? null : on,
          })),
        });
        toast.success(
          `${PHENOLOGY_LABEL[stage]} recorded for ${marked} ${marked === 1 ? 'variety' : 'varieties'}`
        );
      } else {
        await trpc.phenology.mark.mutate({ orchardId, stage, observedOn });
        toast.success(`${PHENOLOGY_LABEL[stage]} recorded`);
      }
      setBehind({});
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
        Mark {PHENOLOGY_LABEL[stages[0]].toLowerCase()}
      </Button>
    );
  }

  return (
    <div className="w-full sm:w-auto sm:min-w-80 border border-line rounded-md p-3 bg-paper">
      <Label className="text-xs">Which stage</Label>
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
      {byVariety && (
        <p className="text-[11px] text-bark mt-1">
          Call it when about three quarters of a variety is there — a few trees ahead
          or behind is normal.
        </p>
      )}

      <Label className="text-xs mt-3 block">
        {byVariety ? 'Date for everything' : 'On'}
      </Label>
      <Input
        type="date"
        value={observedOn}
        max={today}
        onChange={(e) => setObservedOn(e.target.value)}
      />

      {byVariety && (
        <div className="mt-3">
          <Label className="text-xs">Anything behind?</Label>
          <div className="flex flex-wrap gap-1 mt-1">
            {varieties.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => toggleBehind(v)}
                className={`px-2 py-1 rounded-md text-xs border ${
                  v in behind
                    ? 'bg-flag-600 text-white border-flag-600'
                    : 'bg-surface text-bark border-line hover:bg-canopy-50 dark:hover:bg-canopy-600/10'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          {laggards.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {laggards.map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <span className="text-xs text-ink w-32 truncate">{v}</span>
                  <Input
                    type="date"
                    max={today}
                    value={behind[v]}
                    onChange={(e) => setBehind({ ...behind, [v]: e.target.value })}
                    className="h-8"
                  />
                </div>
              ))}
              <p className="text-[11px] text-bark">
                Leave a date blank for anything not there yet — it is skipped, not guessed.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 size={14} className="animate-spin mr-1.5" aria-hidden />}
          {byVariety
            ? `Mark ${varieties.length - laggards.length} of ${varieties.length}`
            : 'Save'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setBehind({});
          }}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
