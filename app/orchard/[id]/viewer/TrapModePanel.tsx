'use client';

import { TRAP_NOTE, TRAP_TYPES, TRAP_LABEL, type TrapType } from '@/lib/traps';
import { TRAP_COLORS } from './useTrapLayer';

interface TrapModePanelProps {
  trapType: TrapType;
  label: string;
  placedCount: number;
  onTrapTypeChange: (t: TrapType) => void;
  onLabelChange: (v: string) => void;
  onExit: () => void;
}

/**
 * What the next tap will place. Mirrors the marking-mode panel: set the
 * type and the name once, then drop traps by tapping, because the whole
 * round is hung in one walk.
 */
export default function TrapModePanel({
  trapType,
  label,
  placedCount,
  onTrapTypeChange,
  onLabelChange,
  onExit,
}: TrapModePanelProps) {
  return (
    <div className="absolute top-20 left-4 z-20 bg-surface rounded-xl shadow-lg border border-canopy-600/40 p-4 w-[272px] max-h-[calc(100dvh-7rem)] overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs font-semibold tracking-wider text-canopy-700 dark:text-canopy-100">
          HANGING TRAPS
        </span>
        <button
          onClick={onExit}
          className="text-xs text-bark hover:text-ink"
          aria-label="Leave trap mode"
        >
          Done
        </button>
      </div>

      <p className="text-xs text-bark mb-3">Tap the map where the trap hangs.</p>

      <label className="block text-xs text-bark mb-1">Type</label>
      <select
        value={trapType}
        onChange={(e) => onTrapTypeChange(e.target.value as TrapType)}
        className="w-full h-9 px-2 bg-paper text-ink border border-line rounded-md text-sm mb-1"
      >
        {TRAP_TYPES.map((t) => (
          <option key={t} value={t}>
            {TRAP_LABEL[t]}
          </option>
        ))}
      </select>
      <p className="flex items-start gap-1.5 text-[11px] text-bark mb-3">
        <span
          aria-hidden
          className="mt-1 h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-surface"
          style={{ backgroundColor: TRAP_COLORS[trapType] }}
        />
        <span>{TRAP_NOTE[trapType]}</span>
      </p>

      <label className="block text-xs text-bark mb-1">Name</label>
      <input
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        placeholder="Sphere 1"
        className="w-full h-9 px-2 bg-paper text-ink border border-line rounded-md text-sm"
      />
      <p className="text-[11px] text-bark mt-1">
        A trailing number counts up on its own, so tapping four times gives you Sphere 1
        through 4.
      </p>

      {placedCount > 0 && (
        <p className="survey-caption mt-3">
          {placedCount} hung this session
        </p>
      )}
    </div>
  );
}
