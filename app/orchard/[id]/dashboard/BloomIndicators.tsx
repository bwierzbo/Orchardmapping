'use client';

/**
 * The trees watched for full bloom this spring, and a tap to say one is
 * there today. Full bloom on a few indicators, early to late, places every
 * other variety's bloom and so its picking window (lib/bloom-estimate.ts).
 * Full bloom here means 70 to 80% of blossoms open, as on the stage marker.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Flower2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { formatYMD } from '@/lib/dates';

export interface IndicatorRow {
  treeId: string;
  variety: string | null;
  /** Full bloom recorded this season for the tree's variety. */
  fullBloomOn: string | null;
}

export default function BloomIndicators({
  orchardId,
  today,
  indicators,
  suggestion,
  canEdit,
}: {
  orchardId: string;
  today: string;
  indicators: IndicatorRow[];
  /** Varieties to pick indicator trees from, when none are chosen yet. */
  suggestion: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const markToday = async (row: IndicatorRow) => {
    if (!row.variety) return;
    setBusy(row.treeId);
    try {
      await trpc.phenology.mark.mutate({
        orchardId,
        stage: 'full_bloom',
        observedOn: today,
        scope: 'variety',
        scopeValue: row.variety,
      });
      toast.success(`${row.variety}: full bloom ${formatYMD(today)}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record full bloom');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="text-sm font-medium text-ink flex items-center gap-1.5">
        <Flower2 aria-hidden size={15} className="text-bark" /> Bloom indicators
      </p>
      {indicators.length === 0 ? (
        <p className="text-xs text-bark mt-1">
          None chosen. Pick one tree each of an early, a mid and a late variety
          {suggestion.length > 0 && <> (here: {suggestion.join(', ')})</>} and mark it
          &ldquo;Watch for full bloom&rdquo; on its tree panel. Their full bloom places every
          other variety&rsquo;s bloom, and so its picking window.
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {indicators.map((row) => (
            <li key={row.treeId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <span className="text-ink">{row.variety ?? 'No variety'}</span>{' '}
                <span className="font-mono text-xs text-bark">{row.treeId}</span>
              </span>
              {row.fullBloomOn ? (
                <span className="text-xs text-bark">Full bloom {formatYMD(row.fullBloomOn)}</span>
              ) : canEdit && row.variety ? (
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => markToday(row)}>
                  {busy === row.treeId ? 'Saving…' : 'Full bloom today'}
                </Button>
              ) : (
                <span className="text-xs text-bark">Not yet</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
