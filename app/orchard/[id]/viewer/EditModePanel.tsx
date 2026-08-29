'use client';

import { generateTreeIdPreview } from './tree-id-preview';

interface EditModePanelProps {
  orchardId: string;
  row: string;
  position: number;
  autoIncrement: boolean;
  onRowChange: (row: string) => void;
  onPositionChange: (position: number) => void;
  onAutoIncrementChange: (v: boolean) => void;
  onExit: () => void;
}

export default function EditModePanel({
  orchardId,
  row,
  position,
  autoIncrement,
  onRowChange,
  onPositionChange,
  onAutoIncrementChange,
  onExit,
}: EditModePanelProps) {
  return (
    <div className="absolute top-20 left-4 z-20 bg-white rounded-xl shadow-lg border border-orange-200 p-4 w-[260px]">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs font-semibold tracking-wider text-orange-700">
          MARKING MODE
        </span>
        <button
          onClick={onExit}
          className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded bg-gray-100"
        >
          Exit (Esc)
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Click the map to place a tree at the row and position below.
      </p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Row</span>
          <input
            type="text"
            value={row}
            onChange={(e) => onRowChange(e.target.value)}
            placeholder="1"
            className="mt-1 w-full text-sm px-2.5 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Position</span>
          <input
            type="number"
            min={1}
            value={position}
            onChange={(e) => onPositionChange(Math.max(1, parseInt(e.target.value) || 1))}
            className="mt-1 w-full text-sm px-2.5 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600 mb-2">
        <input
          type="checkbox"
          checked={autoIncrement}
          onChange={(e) => onAutoIncrementChange(e.target.checked)}
          className="rounded"
        />
        Auto-increment position
      </label>
      <p className="font-mono text-[11px] text-gray-400">
        Next: {generateTreeIdPreview(orchardId, row, position)}
      </p>
    </div>
  );
}
