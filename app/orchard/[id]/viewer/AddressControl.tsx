'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, MapPin, X } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { formatAddress } from '@/lib/address';

/**
 * Change a tree's block, row and position.
 *
 * Since migration 049 this is an ordinary edit -- the tree's id is
 * permanent, so nothing that refers to it has to move. It stays its own
 * control rather than a field in the main form because the server checks
 * the spot is free, defers the address constraint so two trees can swap,
 * and records the move in the tree's history.
 *
 * Any part may be left blank: clearing all three takes the tree out of
 * the layout without deleting it.
 */
export default function AddressControl({
  treeId,
  blockId,
  rowId,
  position,
  onMoved,
}: {
  treeId: string;
  blockId: string | null;
  rowId: string | null;
  position: string | null;
  onMoved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [block, setBlock] = useState(blockId ?? '');
  const [row, setRow] = useState(rowId ?? '');
  const [pos, setPos] = useState(position ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const r = await trpc.tree.setAddress.mutate({
        treeId,
        blockId: block.trim() || null,
        rowId: row.trim() || null,
        position: pos.trim() || null,
      });
      toast.success(`Moved from ${r.previousAddress} to ${r.address}.`);
      setOpen(false);
      onMoved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not move this tree');
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setOpen(false);
    setBlock(blockId ?? '');
    setRow(rowId ?? '');
    setPos(position ?? '');
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-xs text-bark tracking-wide hover:text-canopy-700 inline-flex items-center gap-1 rounded"
        title="Change this tree's block, row and position"
      >
        {formatAddress({ block_id: blockId, row_id: rowId, position })}
        <MapPin size={11} aria-hidden />
      </button>
    );
  }

  const field = 'px-1.5 py-0.5 text-xs font-mono border border-line rounded bg-surface text-ink';

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <label className="sr-only" htmlFor={`block-${treeId}`}>Block or section</label>
      <input
        id={`block-${treeId}`}
        value={block}
        onChange={(e) => setBlock(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' ? save() : e.key === 'Escape' ? cancel() : undefined}
        placeholder="Block"
        className={`w-20 ${field}`}
        autoFocus
      />
      <label className="sr-only" htmlFor={`row-${treeId}`}>Row</label>
      <span className="font-mono text-xs text-bark">R</span>
      <input
        id={`row-${treeId}`}
        value={row}
        onChange={(e) => setRow(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' ? save() : e.key === 'Escape' ? cancel() : undefined}
        className={`w-14 ${field}`}
      />
      <label className="sr-only" htmlFor={`pos-${treeId}`}>Position</label>
      <span className="font-mono text-xs text-bark">P</span>
      <input
        id={`pos-${treeId}`}
        value={pos}
        onChange={(e) => setPos(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' ? save() : e.key === 'Escape' ? cancel() : undefined}
        className={`w-16 ${field}`}
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        aria-label="Save new address"
        className="p-1 text-canopy-700 hover:bg-canopy-50 rounded disabled:opacity-40"
      >
        {saving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
      </button>
      <button
        type="button"
        onClick={cancel}
        aria-label="Cancel"
        className="p-1 text-bark hover:bg-canopy-50 rounded"
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
