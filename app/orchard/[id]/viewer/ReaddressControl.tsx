'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, MapPin, X } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

/**
 * Change a tree's row and position.
 *
 * Kept apart from the ordinary field editor because it is not an
 * ordinary field. A tree's id is built from its address, so moving one
 * rewrites the id and every record that refers to it. The plain update
 * path deliberately ignores row and position for that reason.
 */
export default function ReaddressControl({
  treeId,
  rowId,
  position,
  onMoved,
}: {
  treeId: string;
  rowId: string | null;
  position: string | null;
  onMoved: (newTreeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState(rowId ?? '');
  const [pos, setPos] = useState(position ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!row.trim() || !pos.trim()) return;
    setSaving(true);
    try {
      const r = await trpc.tree.readdress.mutate({
        treeId,
        rowId: row.trim(),
        position: pos.trim(),
      });
      toast.success(
        r.movedReferences > 0
          ? `Moved to R${row.trim()} · P${pos.trim()}, with ${r.movedReferences} record${r.movedReferences === 1 ? '' : 's'} of its history.`
          : `Moved to R${row.trim()} · P${pos.trim()}.`
      );
      setOpen(false);
      onMoved(r.treeId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not move this tree');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-xs text-bark tracking-wide hover:text-canopy-700 inline-flex items-center gap-1 rounded"
        title="Change this tree's row and position"
      >
        R{rowId ?? '—'} · P{position ?? '—'}
        <MapPin size={11} aria-hidden />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor={`row-${treeId}`}>Row</label>
      <span className="font-mono text-xs text-bark">R</span>
      <input
        id={`row-${treeId}`}
        value={row}
        onChange={(e) => setRow(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        className="w-14 px-1.5 py-0.5 text-xs font-mono border border-line rounded bg-surface text-ink"
        autoFocus
      />
      <label className="sr-only" htmlFor={`pos-${treeId}`}>Position</label>
      <span className="font-mono text-xs text-bark">P</span>
      <input
        id={`pos-${treeId}`}
        value={pos}
        onChange={(e) => setPos(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
        className="w-16 px-1.5 py-0.5 text-xs font-mono border border-line rounded bg-surface text-ink"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving || !row.trim() || !pos.trim()}
        aria-label="Save new address"
        className="p-1 text-canopy-700 hover:bg-canopy-50 rounded disabled:opacity-40"
      >
        {saving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setRow(rowId ?? ''); setPos(position ?? ''); }}
        aria-label="Cancel"
        className="p-1 text-bark hover:bg-canopy-50 rounded"
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
