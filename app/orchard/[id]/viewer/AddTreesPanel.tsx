'use client';

import { Undo2, Check, Crosshair, MousePointerClick } from 'lucide-react';
import { formatAddress } from '@/lib/address';
import VarietyPicker from './VarietyPicker';
import type { TreeStatus } from '@/lib/types';
import { TREE_STATUSES } from '@/lib/types';

const STATUS_LABEL: Record<TreeStatus, string> = {
  healthy: 'Healthy',
  stressed: 'Stressed',
  dead: 'Dead',
  unknown: 'Unknown',
};

interface AddTreesPanelProps {
  block: string;
  row: string;
  position: string;
  autoIncrement: boolean;
  orchardId: string;
  fruitType: string;
  fruitTypes: string[];
  variety: string;
  status: TreeStatus;
  existingBlocks: string[];
  existingRows: string[];
  placedCount: number;
  canUndo: boolean;
  /**
   * Touch screen: the form sits in a sheet over the lower half and the map
   * is aimed with a crosshair. A mouse gets the floating card and clicks a
   * pin onto the aerial photo instead.
   */
  aiming: boolean;
  /** True once there is a spot to accept (a dropped pin, or always when aiming). */
  hasSpot: boolean;
  saving: boolean;
  onBlockChange: (block: string) => void;
  onRowChange: (row: string) => void;
  onPositionChange: (position: string) => void;
  onAutoIncrementChange: (v: boolean) => void;
  onFruitTypeChange: (v: string) => void;
  onVarietyChange: (v: string) => void;
  onStatusChange: (s: TreeStatus) => void;
  onAccept: () => void;
  onNextRow: () => void;
  onUndoLast: () => void;
  onExit: () => void;
}

export default function AddTreesPanel({
  block,
  row,
  position,
  autoIncrement,
  orchardId,
  fruitType,
  fruitTypes,
  variety,
  status,
  existingBlocks,
  existingRows,
  placedCount,
  canUndo,
  aiming,
  hasSpot,
  saving,
  onBlockChange,
  onRowChange,
  onPositionChange,
  onAutoIncrementChange,
  onFruitTypeChange,
  onVarietyChange,
  onStatusChange,
  onAccept,
  onNextRow,
  onUndoLast,
  onExit,
}: AddTreesPanelProps) {
  const field =
    'mt-1 w-full text-sm px-2.5 py-1.5 bg-surface text-ink border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-flag-600';

  // Aiming: a sheet across the bottom half, leaving the top half of the map
  // to pan. Bottom rather than top so the inputs and Accept are in reach of
  // a thumb while the other hand is holding a branch.
  const shell = aiming
    ? 'fixed inset-x-0 bottom-0 z-20 h-1/2 bg-surface border-t border-flag-600/30 shadow-[0_-4px_16px_rgba(0,0,0,0.12)] p-4 overflow-y-auto'
    : 'absolute top-20 left-4 z-20 bg-surface rounded-xl shadow-lg border border-flag-600/30 p-4 w-[300px] max-h-[calc(100dvh-7rem)] overflow-y-auto';

  return (
    <div className={shell}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs font-semibold tracking-wider text-flag-600">
          ADDING TREES
        </span>
        <button
          onClick={onExit}
          className="text-xs text-bark hover:text-ink px-2 py-1 rounded bg-paper"
        >
          Done (Esc)
        </button>
      </div>

      {/* Where the tree is, in the orchard's own terms. The three parts are
          stored separately: a block typed into the row box is a different
          address and will not group with the rest of its block. */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <label className="block">
          <span className="text-xs font-medium text-bark">Block</span>
          <input
            type="text"
            value={block}
            onChange={(e) => onBlockChange(e.target.value)}
            placeholder="Upper"
            list="existing-blocks"
            className={field}
          />
          <datalist id="existing-blocks">
            {existingBlocks.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-bark">Row</span>
          <input
            type="text"
            value={row}
            onChange={(e) => onRowChange(e.target.value)}
            placeholder="3"
            list="existing-rows"
            className={field}
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
            type="text"
            value={position}
            onChange={(e) => onPositionChange(e.target.value)}
            placeholder="12"
            className={field}
          />
        </label>
      </div>

      {/* What the tree is. Species first, because it narrows the varieties. */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <label className="block">
          <span className="text-xs font-medium text-bark">Species</span>
          <input
            type="text"
            value={fruitType}
            onChange={(e) => onFruitTypeChange(e.target.value)}
            placeholder="apple"
            list="fruit-types"
            className={field}
          />
          <datalist id="fruit-types">
            {fruitTypes.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <div className="block">
          <span className="text-xs font-medium text-bark">Variety</span>
          <div className="mt-1">
            <VarietyPicker
              orchardId={orchardId}
              value={variety}
              onChange={onVarietyChange}
              fruitType={fruitType}
              placeholder="optional"
            />
          </div>
        </div>
      </div>

      <label className="block mb-3">
        <span className="text-xs font-medium text-bark">Status</span>
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value as TreeStatus)}
          className={`${field} bg-surface text-ink`}
        >
          {TREE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11px] text-bark/70">
          Unknown until someone looks. Set it only if you are at the tree.
        </span>
      </label>

      {/* Nothing is written until Accept, so a spot can always be corrected
          first -- the whole reason the dot is not dropped on a GPS fix. */}
      <p className="flex items-start gap-1.5 text-xs text-bark bg-paper rounded-md px-2.5 py-2 mb-2">
        {aiming ? (
          <>
            <Crosshair aria-hidden size={13} className="shrink-0 mt-0.5 text-flag-600" />
            Drag the map until the crosshair is on the tree, then accept.
          </>
        ) : (
          <>
            <MousePointerClick aria-hidden size={13} className="shrink-0 mt-0.5 text-flag-600" />
            {hasSpot
              ? 'Drag the pin to line it up, then accept. Clicking elsewhere moves it.'
              : 'Click the map where the tree stands. You can drag the pin before accepting.'}
          </>
        )}
      </p>

      <button
        onClick={onAccept}
        disabled={!hasSpot || saving || !row.trim() || !position.trim()}
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-3 mb-3 text-sm font-semibold rounded-lg bg-flag-600 text-white hover:bg-flag-700 disabled:opacity-40"
      >
        <Check aria-hidden size={16} />
        {saving
          ? 'Saving…'
          : `Add ${formatAddress({ block_id: block, row_id: row, position }) || 'tree'}`}
      </button>

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

      {placedCount > 0 && (
        <div className="font-mono text-[11px] text-bark/70">{placedCount} placed</div>
      )}
    </div>
  );
}
