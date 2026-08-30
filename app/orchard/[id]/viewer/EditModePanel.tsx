'use client';

import { Undo2 } from 'lucide-react';
import { generateTreeIdPreview } from '@/lib/row-id';
import type { TreeStatus } from '@/lib/types';
import { TREE_STATUSES } from '@/lib/types';

const STATUS_LABEL: Record<TreeStatus, string> = {
  healthy: 'Healthy',
  stressed: 'Stressed',
  dead: 'Dead',
  unknown: 'Unknown',
};

interface EditModePanelProps {
  orchardId: string;
  row: string;
  position: number;
  autoIncrement: boolean;
  variety: string;
  status: TreeStatus;
  existingRows: string[];
  placedCount: number;
  canUndo: boolean;
  onRowChange: (row: string) => void;
  onPositionChange: (position: number) => void;
  onAutoIncrementChange: (v: boolean) => void;
  onVarietyChange: (v: string) => void;
  onStatusChange: (s: TreeStatus) => void;
  onNextRow: () => void;
  onUndoLast: () => void;
  onExit: () => void;
}

export default function EditModePanel({
  orchardId,
  row,
  position,
  autoIncrement,
  variety,
  status,
  existingRows,
  placedCount,
  canUndo,
  onRowChange,
  onPositionChange,
  onAutoIncrementChange,
  onVarietyChange,
  onStatusChange,
  onNextRow,
  onUndoLast,
  onExit,
}: EditModePanelProps) {
  return (
    <div className="absolute top-20 left-4 z-20 bg-surface rounded-xl shadow-lg border border-flag-600/30 p-4 w-[272px] max-h-[calc(100dvh-7rem)] overflow-y-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs font-semibold tracking-wider text-flag-600">
          MARKING MODE
        </span>
        <button
          onClick={onExit}
          className="text-xs text-bark hover:text-ink px-2 py-1 rounded bg-paper"
        >
          Exit (Esc)
        </button>
      </div>
      <p className="text-xs text-bark mb-3">
        Tap the map to place a tree. Position advances automatically.
      </p>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <label className="block">
          <span className="text-xs font-medium text-bark">Row</span>
          <input
            type="text"
            value={row}
            onChange={(e) => onRowChange(e.target.value)}
            placeholder="1"
            list="existing-rows"
            className="mt-1 w-full text-sm px-2.5 py-1.5 bg-surface text-ink border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-flag-600"
          />
          <datalist id="existing-rows">
            {existingRows.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-bark">Position</span>
          <input
            type="number"
            min={1}
            value={position}
            onChange={(e) => onPositionChange(Math.max(1, parseInt(e.target.value) || 1))}
            className="mt-1 w-full text-sm px-2.5 py-1.5 bg-surface text-ink border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-flag-600"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <label className="block">
          <span className="text-xs font-medium text-bark">Variety</span>
          <input
            type="text"
            value={variety}
            onChange={(e) => onVarietyChange(e.target.value)}
            placeholder="optional"
            className="mt-1 w-full text-sm px-2.5 py-1.5 bg-surface text-ink border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-flag-600"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-bark">Status</span>
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value as TreeStatus)}
            className="mt-1 w-full text-sm px-2.5 py-1.5 border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-flag-600 bg-surface text-ink"
          >
            {TREE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-bark mb-3">
        <input
          type="checkbox"
          checked={autoIncrement}
          onChange={(e) => onAutoIncrementChange(e.target.checked)}
          className="rounded"
        />
        Auto-advance position
      </label>

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={onNextRow}
          className="flex-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-paper text-ink hover:bg-line"
          title="Move to the next row, starting at its next open position"
        >
          Next row →
        </button>
        <button
          onClick={onUndoLast}
          disabled={!canUndo}
          className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-paper text-ink hover:bg-line disabled:opacity-40"
        >
          <Undo2 aria-hidden size={13} /> Undo last
        </button>
      </div>

      <div className="flex items-center justify-between font-mono text-[11px] text-bark/70">
        <span>Next: {generateTreeIdPreview(orchardId, row, position)}</span>
        {placedCount > 0 && <span>{placedCount} placed</span>}
      </div>
    </div>
  );
}
