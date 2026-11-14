'use client';

/**
 * Growth stage from a photo: take a picture of the tree, see what stage the
 * app reads in it, confirm or change it, save. Nothing is recorded until the
 * person saves, and what they save is theirs -- the suggestion is kept
 * beside it (080) only to learn how often it was right.
 *
 * The stage is recorded for the tree's variety, as the stage marker records
 * it, so it feeds the spray programme and, at full bloom, the harvest
 * calendar.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { createTreeEvent } from '@/lib/api/trees';
import { Button } from '@/components/ui/button';
import PhotoButton from '@/components/PhotoButton';
import { PHENOLOGY_HELP, PHENOLOGY_LABEL, PHOTO_STAGES } from '@/lib/phenology';
import { dateToYMD } from '@/lib/dates';

type PhotoStage = (typeof PHOTO_STAGES)[number];
interface Suggestion {
  stage: PhotoStage | 'unsure';
  percentOpen: number | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export default function BloomStagePhoto({
  orchardId,
  treeId,
  variety,
  onSaved,
}: {
  orchardId: string;
  treeId: string;
  variety: string | null;
  onSaved: () => void;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [stage, setStage] = useState<PhotoStage | ''>('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPhotoUrl(null);
    setSuggestion(null);
    setStage('');
  };

  const read = async (url: string) => {
    setPhotoUrl(url);
    setReading(true);
    try {
      const s = await trpc.phenology.stageFromPhoto.mutate({ treeId, photoUrl: url });
      setSuggestion(s);
      setStage(s.stage === 'unsure' ? '' : s.stage);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read the photo');
      setSuggestion(null);
    } finally {
      setReading(false);
    }
  };

  const save = async () => {
    if (!stage || !photoUrl || !variety) return;
    setSaving(true);
    try {
      const today = dateToYMD(new Date());
      await trpc.phenology.mark.mutate({
        orchardId,
        stage,
        observedOn: today,
        scope: 'variety',
        scopeValue: variety,
        photoUrl,
        suggestedStage: suggestion?.stage ?? 'unsure',
      });
      // The photo also goes on the tree's own history, where its other
      // photos are.
      await createTreeEvent(treeId, {
        event_type: 'observation',
        detail: `${PHENOLOGY_LABEL[stage]} (recorded for ${variety})`,
        photo_url: photoUrl,
      });
      toast.success(`${variety}: ${PHENOLOGY_LABEL[stage]} recorded for today`);
      reset();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record the stage');
    } finally {
      setSaving(false);
    }
  };

  if (!variety) {
    return <p className="text-xs text-bark">Give this tree a variety to record its stage from a photo.</p>;
  }

  return (
    <div className="space-y-2">
      {!photoUrl ? (
        <PhotoButton treeId={treeId} onUploaded={read} label="Stage from photo" className="h-9 px-3" />
      ) : (
        <div className="rounded-md border border-line p-3 space-y-2">
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a just-taken Blob photo, shown once */}
            <img src={photoUrl} alt={`Photo of ${treeId}`} className="h-20 w-20 rounded object-cover shrink-0" />
            <div className="min-w-0 text-sm">
              {reading ? (
                <p className="text-bark">Reading the stage…</p>
              ) : suggestion ? (
                <>
                  <p className="text-ink font-medium">
                    {suggestion.stage === 'unsure'
                      ? 'Could not tell from this photo'
                      : `Looks like ${PHENOLOGY_LABEL[suggestion.stage]}`}
                    {suggestion.percentOpen != null && ` · about ${suggestion.percentOpen}% open`}
                  </p>
                  <p className="text-xs text-bark">
                    {suggestion.reason}
                    {suggestion.stage !== 'unsure' && ` (${suggestion.confidence} confidence)`}
                  </p>
                </>
              ) : (
                <p className="text-bark">No suggestion. Choose the stage yourself.</p>
              )}
            </div>
          </div>
          {!reading && (
            <>
              <label className="block text-xs text-bark">
                Stage to record for {variety} today
                <select
                  className="mt-1 block w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
                  value={stage}
                  onChange={(e) => setStage(e.target.value as PhotoStage | '')}
                >
                  <option value="">Choose…</option>
                  {PHOTO_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {PHENOLOGY_LABEL[s]} — {PHENOLOGY_HELP[s]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <Button size="sm" disabled={!stage || saving} onClick={save}>
                  {saving ? 'Saving…' : 'Record'}
                </Button>
                <Button size="sm" variant="ghost" disabled={saving} onClick={reset}>
                  Discard
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
