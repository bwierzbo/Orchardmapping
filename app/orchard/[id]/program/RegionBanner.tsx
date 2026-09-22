'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';

/**
 * Where this program came from, and where it differs from the advice.
 *
 * Shown at the top of the program because the honest answer to "should I
 * spray this week" depends on which climate the advice was written for.
 * Before regions existed, every orchard silently ran a calendar built for
 * one microclimate on the Olympic Peninsula.
 *
 * An orchard with no region gets no program at all, and says so. That is
 * deliberate: pest and spray timing is calibrated per climate, and a
 * confident date from the wrong one is worse than no date — it includes
 * worker re-entry intervals.
 */
export default function RegionBanner({
  orchardId,
  regionName,
  stepCount,
  drift,
  canEdit,
}: {
  orchardId: string;
  regionName: string | null;
  stepCount: number;
  drift: {
    notAdopted: Array<{ key: string; title: string }>;
    customised: Array<{ key: string; title: string }>;
    invented: Array<{ key: string; title: string }>;
  };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function adopt() {
    setBusy(true);
    try {
      const r = await trpc.program2.adopt.mutate({ orchardId });
      toast.success(
        r.added.length === 0
          ? 'Nothing to add — this orchard already has every step its region recommends.'
          : `Added ${r.added.length} step${r.added.length === 1 ? '' : 's'} recommended for ${r.region}.`
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not adopt the recommendation');
    } finally {
      setBusy(false);
    }
  }

  if (!regionName) {
    return (
      <section className="mb-4 rounded-xl border border-flag-600/30 bg-flag-600/5 p-4">
        <h2 className="text-sm font-medium text-ink">No region set, so no program</h2>
        <p className="mt-1 text-sm text-bark">
          Spray timing, pest pressure and disease models are calibrated per climate — down to
          worker re-entry intervals. Rather than hand this orchard a calendar written for
          somewhere else, nothing is scheduled until a region is chosen.
        </p>
        <p className="mt-2 text-sm text-bark">
          Everything else keeps working: the map, walks, harvest records, traps and weather are
          the same anywhere.
        </p>
        {canEdit && (
          <Link
            href={`/orchard/${orchardId}/dashboard`}
            className="mt-3 inline-flex px-3 py-1.5 rounded-md text-sm font-medium bg-canopy-600 text-white hover:bg-canopy-700"
          >
            Choose a region
          </Link>
        )}
      </section>
    );
  }

  const differs =
    drift.notAdopted.length + drift.customised.length + drift.invented.length > 0;

  return (
    <section className="mb-4 rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-medium text-ink">
        {stepCount} step{stepCount === 1 ? '' : 's'}, from the {regionName} recommendation
      </h2>

      {!differs ? (
        <p className="mt-1 text-sm text-bark">
          Unchanged from what that region recommends. Every step here is yours to retime,
          switch off or delete.
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-bark">
          {drift.customised.length > 0 && (
            <li>
              <span className="text-ink">{drift.customised.length} changed</span> since you
              adopted them — {drift.customised.map((s) => s.title).join(', ')}
            </li>
          )}
          {drift.invented.length > 0 && (
            <li>
              <span className="text-ink">{drift.invented.length} of your own</span>, which the
              recommendation does not include
            </li>
          )}
          {drift.notAdopted.length > 0 && (
            <li>
              <span className="text-ink">{drift.notAdopted.length} recommended</span> and not in
              your program — {drift.notAdopted.map((s) => s.title).join(', ')}
            </li>
          )}
        </ul>
      )}

      {canEdit && drift.notAdopted.length > 0 && (
        <button
          onClick={adopt}
          disabled={busy}
          className="mt-3 px-3 py-1.5 rounded-md text-sm font-medium bg-canopy-600 text-white hover:bg-canopy-700 disabled:opacity-50"
        >
          {busy ? 'Adding…' : `Add the ${drift.notAdopted.length} missing`}
        </button>
      )}
      {canEdit && drift.notAdopted.length > 0 && (
        <p className="mt-1.5 text-xs text-bark">
          Adds only what is missing. Steps you have changed are left exactly as they are.
        </p>
      )}
    </section>
  );
}
