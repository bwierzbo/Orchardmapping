'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, X } from 'lucide-react';
import type { TrapRow } from '@/lib/api/traps';
import { TRAP_LABEL, TRAP_TARGET } from '@/lib/traps';
import { formatYMD } from '@/lib/dates';
import { TRAP_COLORS } from './useTrapLayer';

/**
 * A trap, tapped in the row. The one thing worth doing here is entering
 * what was on it — that count is what turns a watch in the program into
 * a job, and it should not need a trip back to the dashboard.
 */
export default function TrapDetailPanel({
  trap,
  orchardId,
  today,
  canEdit,
  onRecordCount,
  onRetire,
  onClose,
}: {
  trap: TrapRow;
  orchardId: string;
  today: string;
  canEdit: boolean;
  onRecordCount: (count: number) => Promise<void>;
  onRetire: () => Promise<void>;
  onClose: () => void;
}) {
  const [count, setCount] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = Number(count);
    if (count === '' || !Number.isFinite(n) || n < 0) return;
    setBusy(true);
    try {
      await onRecordCount(n);
      setCount('');
    } finally {
      setBusy(false);
    }
  };

  const alreadyToday = trap.lastCountedOn === today;

  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 w-[min(22rem,calc(100vw-2rem))] bg-surface rounded-xl shadow-lg border border-line p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium text-ink truncate">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-surface"
              style={{ backgroundColor: TRAP_COLORS[trap.trapType] }}
            />
            {trap.label}
          </p>
          <p className="text-xs text-bark">
            {TRAP_LABEL[trap.trapType]}
            {trap.locationNote ? ` · ${trap.locationNote}` : ''}
          </p>
        </div>
        <button onClick={onClose} className="text-bark hover:text-ink p-1" aria-label="Close">
          <X size={16} aria-hidden />
        </button>
      </div>

      <p className="survey-caption mt-2">
        {trap.lastCountedOn
          ? `Last read ${formatYMD(trap.lastCountedOn)} · ${trap.lastCount}`
          : 'Never read'}
        {trap.seasonTotal > 0 && ` · ${trap.seasonTotal} this season`}
      </p>

      {canEdit && (
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs text-bark mb-1" htmlFor="trap-count">
              On it today
            </label>
            <input
              id="trap-count"
              type="number"
              min={0}
              inputMode="numeric"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={alreadyToday ? 'Correct today’s count' : '0'}
              className="w-full h-10 px-3 bg-paper text-ink border border-line rounded-md text-sm"
            />
          </div>
          <button
            onClick={submit}
            disabled={busy || count === ''}
            className="h-10 px-4 rounded-md bg-canopy-600 text-white dark:text-paper text-sm font-medium hover:bg-canopy-700 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
            Record
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <Link
          href={`/orchard/${orchardId}/pests/${TRAP_TARGET[trap.trapType]}`}
          className="text-xs text-canopy-700 dark:text-canopy-100 hover:underline"
        >
          What it catches →
        </Link>
        {canEdit && (
          <button
            onClick={onRetire}
            className="text-xs text-bark hover:text-destructive"
          >
            Take it down
          </button>
        )}
      </div>
    </div>
  );
}
