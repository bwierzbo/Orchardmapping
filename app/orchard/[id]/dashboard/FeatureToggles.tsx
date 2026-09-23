'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { CalendarRange, FlaskConical } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

/**
 * Whether this orchard runs a spray or feeding programme here.
 *
 * Both start off. Mapping somebody's trees and running their spray
 * programme are different jobs, and only the second one needs opting
 * into — it is the one that comes with worker re-entry intervals.
 *
 * Off hides the programme, not the orchard: the map, walks, harvests,
 * traps, the pest library and the variety library are the same work
 * whoever owns the trees, and they stay.
 */
export default function FeatureToggles({
  orchardId,
  ipmEnabled,
  nutritionEnabled,
  canEdit,
}: {
  orchardId: string;
  ipmEnabled: boolean;
  nutritionEnabled: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'ipm' | 'nutrition' | null>(null);

  async function toggle(feature: 'ipm' | 'nutrition', next: boolean) {
    setBusy(feature);
    try {
      await trpc.orchard.setFeatures.mutate({ orchardId, [feature]: next });
      toast.success(
        next
          ? `${feature === 'ipm' ? 'Pest management' : 'Nutrition'} is on for this orchard.`
          : `${feature === 'ipm' ? 'Pest management' : 'Nutrition'} is off. Nothing is deleted — turn it back on and the programme is as you left it.`
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change that');
    } finally {
      setBusy(null);
    }
  }

  const rows = [
    {
      key: 'ipm' as const,
      icon: CalendarRange,
      label: 'Pest management',
      on: ipmEnabled,
      blurb: 'The spray programme, what is due this week, and reviews when the regional advice changes.',
    },
    {
      key: 'nutrition' as const,
      icon: FlaskConical,
      label: 'Nutrition',
      on: nutritionEnabled,
      blurb: 'Tissue and soil tests, sufficiency ranges, and what to feed.',
    },
  ];

  return (
    <section className="bg-surface border border-line rounded-lg shadow-xs p-5">
      <p className="survey-caption">Programmes run here</p>
      <p className="text-sm text-bark mt-2">
        Off by default. An orchard you have mapped is not necessarily one you have taken on
        the spraying and feeding for.
      </p>

      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row.key} className="flex items-start gap-3">
            <row.icon aria-hidden size={18} className="mt-0.5 shrink-0 text-bark" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{row.label}</p>
              <p className="text-xs text-bark">{row.blurb}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={row.on}
              aria-label={`${row.label} for this orchard`}
              disabled={!canEdit || busy !== null}
              onClick={() => toggle(row.key, !row.on)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 ${
                row.on
                  ? 'bg-canopy-600 border-canopy-600 text-white hover:bg-canopy-700'
                  : 'bg-paper border-line text-bark hover:bg-canopy-50'
              }`}
            >
              {busy === row.key ? '…' : row.on ? 'On' : 'Off'}
            </button>
          </li>
        ))}
      </ul>

      {!canEdit && (
        <p className="mt-3 text-xs text-bark">
          Only an admin of this orchard can change these.
        </p>
      )}
    </section>
  );
}
