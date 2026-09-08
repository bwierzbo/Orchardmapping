'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ClientTree, TreeStatus } from '@/lib/types';
import { STATUS_COLORS } from '@/lib/trees-geojson';
import { STATUS_LABEL } from '@/components/StatusBadge';
import { createTreeEvent } from '@/lib/api/trees';
import { serpentineOrder } from '@/lib/serpentine';
import { ArrowLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface WalkModeProps {
  trees: ClientTree[];
  /** Where to begin — e.g. the currently selected tree; null starts at the top. */
  startTreeId: string | null;
  onSetStatus: (treeId: string, status: TreeStatus) => Promise<boolean>;
  /** Pan the map + highlight the current tree. */
  onFocusTree: (tree: ClientTree) => void;
  onExit: () => void;
}

const WALK_STATUSES: TreeStatus[] = ['healthy', 'stressed', 'dead'];

/**
 * Field survey mode: one thumb-tap per tree. Tapping a status records it
 * and auto-advances along the serpentine path; Skip advances without
 * writing. Designed for a phone held one-handed in the orchard.
 */
export default function WalkMode({
  trees,
  startTreeId,
  onSetStatus,
  onFocusTree,
  onExit,
}: WalkModeProps) {
  // Path is fixed at walk start; edits during the walk don't reshuffle it
  const [path] = useState(() => serpentineOrder(trees));
  const [index, setIndex] = useState(() => {
    if (!startTreeId) return 0;
    const i = path.findIndex((t) => t.tree_id === startTreeId);
    return i >= 0 ? i : 0;
  });
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [recorded, setRecorded] = useState(0);

  const current = path[index] ?? null;
  // Live tree data (status may have just changed) for the header readout
  const liveCurrent = useMemo(
    () => (current ? trees.find((t) => t.tree_id === current.tree_id) ?? current : null),
    [trees, current]
  );

  useEffect(() => {
    if (current) onFocusTree(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (!current || path.length === 0) {
    return null;
  }

  const atEnd = index >= path.length - 1;

  const advance = () => {
    setNoteOpen(false);
    setNote('');
    if (atEnd) onExit();
    else setIndex((i) => i + 1);
  };

  const record = async (status: TreeStatus) => {
    if (busy) return;
    setBusy(true);
    const ok = await onSetStatus(current.tree_id, status);
    setBusy(false);
    if (ok) {
      setRecorded((n) => n + 1);
      advance();
    }
  };

  const saveNote = async () => {
    if (!note.trim() || busy) return;
    setBusy(true);
    try {
      await createTreeEvent(current.tree_id, {
        event_type: 'observation',
        detail: note.trim(),
      });
      setRecorded((n) => n + 1);
      advance();
    } catch {
      // toast-free v1: keep the note in the box so nothing is lost
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 bg-surface border-t border-line shadow-2xl
                 rounded-t-2xl pb-safe md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[420px] md:rounded-2xl md:bottom-4 md:border"
      role="region"
      aria-label="Walk mode"
    >
      {/* Header: where you are + progress */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0 || busy}
          aria-label="Previous tree"
          className="p-2 -m-1 rounded-lg text-bark hover:text-ink hover:bg-canopy-50 disabled:opacity-30"
        >
          <ArrowLeft size={20} aria-hidden />
        </button>
        <div className="text-center min-w-0">
          <p className="font-mono text-xs text-bark tracking-wide">
            R{current.row_id} · P{current.position} — {index + 1}/{path.length}
          </p>
          <p className="text-base font-semibold text-ink truncate">
            {current.variety || 'Unknown variety'}
          </p>
          <p className="text-xs text-bark">
            now: {STATUS_LABEL[liveCurrent?.status ?? current.status]} · recorded {recorded}
          </p>
        </div>
        <button
          onClick={onExit}
          aria-label="Exit walk mode"
          className="p-2 -m-1 rounded-lg text-bark hover:text-ink hover:bg-canopy-50"
        >
          <X size={20} aria-hidden />
        </button>
      </div>

      {/* One-tap status row — record and advance */}
      <div className="grid grid-cols-3 gap-2 px-4 pb-2">
        {WALK_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => record(s)}
            disabled={busy}
            className="h-14 rounded-xl text-white font-semibold text-sm shadow-md active:scale-[0.97] disabled:opacity-50"
            style={{ backgroundColor: STATUS_COLORS[s] }}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Secondary actions */}
      {noteOpen ? (
        <div className="flex gap-2 px-4 pb-4">
          <Input
            autoFocus
            placeholder="Observation…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveNote()}
            className="h-11"
          />
          <Button className="h-11" onClick={saveNote} disabled={busy || !note.trim()}>
            Save
          </Button>
        </div>
      ) : (
        <div className="flex gap-2 px-4 pb-4">
          <Button
            variant="secondary"
            className="h-11 flex-1"
            onClick={() => setNoteOpen(true)}
            disabled={busy}
          >
            + Note
          </Button>
          <Button
            variant="secondary"
            className="h-11 flex-1"
            onClick={advance}
            disabled={busy}
          >
            {atEnd ? 'Finish' : 'Skip'} <ChevronRight size={16} aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
