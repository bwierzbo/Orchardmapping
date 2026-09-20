'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { POSTURES, POSTURE_HELP, POSTURE_LABEL, type Posture } from '@/lib/posture';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * What this orchard is doing about this pest.
 *
 * It lives on the pest's own page because that is where the question
 * arises — you read what something is, and the next thought is whether
 * you are going to do anything about it.
 *
 * Choosing "not treating" is a DECISION, not a gap: it is what stops
 * the coverage check flagging the pest, and the note is what makes the
 * reason survivable when someone reads it back in two years.
 */
export default function PosturePicker({
  orchardId,
  pestKey,
  pestName,
  current,
  currentNote,
}: {
  orchardId: string;
  pestKey: string;
  pestName: string;
  current: Posture | null;
  currentNote: string | null;
}) {
  const router = useRouter();
  const [posture, setPosture] = useState<Posture | ''>(current ?? '');
  const [note, setNote] = useState(currentNote ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!posture) return;
    setBusy(true);
    try {
      await trpc.pest.setPosture.mutate({
        orchardId,
        pestKey,
        posture,
        note: note.trim() || undefined,
      });
      toast.success(`${pestName}: ${POSTURE_LABEL[posture].toLowerCase()}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save that');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await trpc.pest.clearPosture.mutate({ orchardId, pestKey });
      setPosture('');
      setNote('');
      toast.success('Back to undecided');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not clear that');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-surface border border-line rounded-lg p-4 mb-6">
      <h2 className="font-display text-lg text-ink">Are you managing this?</h2>
      <p className="text-sm text-bark mt-0.5">
        {current
          ? 'Change it whenever the answer changes.'
          : 'Undecided. Recording an answer — including “not treating” — is what tells the programme this was considered rather than missed.'}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {POSTURES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPosture(p)}
            className={`px-2.5 py-1.5 rounded-md text-sm font-medium border ${
              posture === p
                ? 'bg-canopy-600 text-white border-canopy-600'
                : 'bg-surface text-bark border-line hover:bg-canopy-50 dark:hover:bg-canopy-600/10'
            }`}
          >
            {POSTURE_LABEL[p]}
          </button>
        ))}
      </div>

      {posture && <p className="text-xs text-bark mt-2">{POSTURE_HELP[posture]}</p>}

      <div className="mt-3">
        <label className="block text-xs text-bark mb-1" htmlFor="posture-note">
          Why {posture === 'off' && <span className="text-flag">— worth writing down</span>}
        </label>
        <Input
          id="posture-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Not a problem in this block; revisit if it shows up"
        />
      </div>

      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={save} disabled={busy || !posture}>
          {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
          Save
        </Button>
        {current && (
          <Button size="sm" variant="ghost" onClick={clear} disabled={busy}>
            Back to undecided
          </Button>
        )}
      </div>
    </section>
  );
}
