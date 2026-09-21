'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';
import type { ClientTree, TreeStatus } from '@/lib/types';
import { TREE_STATUSES } from '@/lib/types';
import { addressKey, formatAddress } from '@/lib/address';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';

/** Columns the grid can edit, in the order they read left to right. */
const COLUMNS = [
  { field: 'block_id', label: 'Block', width: 'w-28' },
  { field: 'row_id', label: 'Row', width: 'w-20' },
  { field: 'position', label: 'Pos', width: 'w-20' },
  { field: 'variety', label: 'Variety', width: 'w-40' },
  { field: 'rootstock', label: 'Rootstock', width: 'w-28' },
  { field: 'fruit_type', label: 'Fruit', width: 'w-24' },
  { field: 'status', label: 'Status', width: 'w-28' },
  { field: 'planted_date', label: 'Planted', width: 'w-32' },
  { field: 'source', label: 'Source', width: 'w-36' },
  { field: 'notes', label: 'Notes', width: 'w-56' },
] as const;

type Field = (typeof COLUMNS)[number]['field'];

const FIELDS = COLUMNS.map((c) => c.field) as Field[];

function original(tree: ClientTree, field: Field): string {
  const v = (tree as unknown as Record<string, unknown>)[field];
  return v == null ? '' : String(v);
}

/**
 * Edit a selection of trees as a spreadsheet.
 *
 * Everything here is per-tree: each row may get its own values, which is
 * what neither a group action (one field, one value) nor a CSV re-import
 * (no history) could do. Only cells that actually changed are sent, so a
 * tree you scrolled past does not appear in its own history as edited.
 *
 * Block, row and position are ordinary columns: renumbering a row is
 * filling the Pos column down, and swapping two trees is typing the two
 * numbers. The save is one transaction with the address constraint
 * deferred, so trees passing through each other's spots is fine.
 */
export default function TreeGridEditor({
  orchardId,
  trees,
  selectedIds,
  onClose,
  onSaved,
}: {
  orchardId: string;
  /** Every tree in the orchard — the ones outside the selection still own their spots. */
  trees: ClientTree[];
  selectedIds: ReadonlySet<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [edits, setEdits] = useState<Record<string, Partial<Record<Field, string>>>>({});
  const [saving, setSaving] = useState(false);

  const rows = useMemo(
    () => trees.filter((t) => selectedIds.has(t.tree_id)),
    [trees, selectedIds]
  );

  const value = (tree: ClientTree, field: Field): string =>
    edits[tree.tree_id]?.[field] ?? original(tree, field);

  const isDirty = (tree: ClientTree, field: Field): boolean => {
    const pending = edits[tree.tree_id]?.[field];
    return pending !== undefined && pending !== original(tree, field);
  };

  function setCell(treeId: string, field: Field, next: string) {
    setEdits((prev) => ({ ...prev, [treeId]: { ...prev[treeId], [field]: next } }));
  }

  /** Copy the top row's value down the column — the renumbering shortcut. */
  function fillDown(field: Field) {
    if (rows.length < 2) return;
    const top = value(rows[0], field);
    const numeric = /^\d+$/.test(top);
    setEdits((prev) => {
      const next = { ...prev };
      rows.forEach((tree, i) => {
        // A number fills as a sequence (1, 2, 3…); anything else repeats.
        const v = numeric ? String(Number(top) + i) : top;
        next[tree.tree_id] = { ...next[tree.tree_id], [field]: v };
      });
      return next;
    });
  }

  /** Paste a block of cells from a spreadsheet, anchored at this cell. */
  function handlePaste(e: React.ClipboardEvent, rowIndex: number, colIndex: number) {
    const text = e.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.trim().includes('\n')) return; // single value: let the input handle it
    e.preventDefault();
    const grid = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    setEdits((prev) => {
      const next = { ...prev };
      grid.forEach((line, r) => {
        const tree = rows[rowIndex + r];
        if (!tree) return;
        line.forEach((cell, c) => {
          const field = FIELDS[colIndex + c];
          if (!field) return;
          next[tree.tree_id] = { ...next[tree.tree_id], [field]: cell.trim() };
        });
      });
      return next;
    });
  }

  /**
   * Spots claimed by more than one tree, counting trees outside the
   * selection — they did not move, and they still hold their places.
   */
  const collisions = useMemo(() => {
    const claims = new Map<string, string[]>();
    for (const tree of trees) {
      const key = selectedIds.has(tree.tree_id)
        ? addressKey({
            block_id: value(tree, 'block_id'),
            row_id: value(tree, 'row_id'),
            position: value(tree, 'position'),
          })
        : addressKey(tree);
      if (!key) continue; // unplaced trees never collide
      claims.set(key, [...(claims.get(key) ?? []), tree.tree_id]);
    }
    const clashing = new Set<string>();
    for (const ids of claims.values()) {
      if (ids.length > 1) for (const id of ids) clashing.add(id);
    }
    return clashing;
  }, [trees, selectedIds, edits]); // eslint-disable-line react-hooks/exhaustive-deps

  const changedRows = useMemo(
    () => rows.filter((t) => FIELDS.some((f) => isDirty(t, f))),
    [rows, edits] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const blockingCollisions = useMemo(
    () => [...collisions].filter((id) => selectedIds.has(id)),
    [collisions, selectedIds]
  );

  async function save() {
    const payload = changedRows.map((tree) => {
      const fields: Record<string, string | null> = {};
      for (const f of FIELDS) {
        if (isDirty(tree, f)) fields[f] = value(tree, f).trim() || null;
      }
      return { treeId: tree.tree_id, fields };
    });
    if (payload.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const r = await trpc.tree.editMany.mutate({ orchardId, edits: payload });
      toast.success(
        `${r.treeCount} ${r.treeCount === 1 ? 'tree' : 'trees'} updated — ${r.fieldsTouched.join(', ')}`,
        {
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                const res = await fetch(`/api/group-actions/${r.groupId}/undo`, { method: 'POST' });
                if (!res.ok) throw new Error((await res.json()).error ?? 'Undo failed');
                const { reverted, skipped } = await res.json();
                toast.success(
                  skipped > 0
                    ? `Undone for ${reverted}; ${skipped} changed since and were left alone.`
                    : `Undone for ${reverted}.`
                );
                onSaved();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Undo failed');
              }
            },
          },
        }
      );
      setEdits({});
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  const cell =
    'w-full px-1.5 py-1 text-xs bg-transparent border border-transparent rounded ' +
    'hover:border-line focus:border-canopy-600 focus:bg-surface focus:outline-none text-ink';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">
            Editing {rows.length} {rows.length === 1 ? 'tree' : 'trees'}
          </h2>
          <p className="survey-caption text-bark/70 truncate">
            {changedRows.length > 0
              ? `${changedRows.length} changed — not saved yet`
              : 'Type in a cell, or fill a column down'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || blockingCollisions.length > 0}>
            {saving ? <Loader2 size={14} className="animate-spin mr-1" aria-hidden /> : null}
            Save {changedRows.length > 0 ? changedRows.length : ''}
          </Button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-bark hover:bg-canopy-50 rounded"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>

      {blockingCollisions.length > 0 && (
        <p className="px-4 py-2 text-xs bg-flag-600/10 text-flag-700 border-b border-line">
          {blockingCollisions.length} {blockingCollisions.length === 1 ? 'tree' : 'trees'} would
          share a spot with another tree. Fix the highlighted rows to save.
        </p>
      )}

      <div className="flex-1 overflow-auto overscroll-contain">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-paper">
            <tr className="text-left text-bark">
              <th scope="col" className="px-3 py-2 font-medium border-b border-line">
                Tree
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.field}
                  scope="col"
                  className={`px-2 py-2 font-medium border-b border-line ${col.width}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>{col.label}</span>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => fillDown(col.field)}
                        className="text-[10px] font-normal text-bark/60 hover:text-canopy-700 underline decoration-dotted"
                        title={`Copy the top ${col.label} down (numbers count up)`}
                      >
                        fill
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((tree, rowIndex) => {
              const clashes = collisions.has(tree.tree_id);
              return (
                <tr
                  key={tree.tree_id}
                  className={clashes ? 'bg-flag-600/10' : 'hover:bg-canopy-50/40'}
                >
                  <td className="px-3 py-1 whitespace-nowrap border-b border-line/60 font-mono text-bark">
                    <span title={`${tree.tree_id} · ${formatAddress(tree)}`}>
                      {tree.tree_no ?? tree.tree_id}
                    </span>
                  </td>
                  {COLUMNS.map((col, colIndex) => (
                    <td
                      key={col.field}
                      className={`px-1 py-0.5 border-b border-line/60 ${
                        isDirty(tree, col.field) ? 'bg-canopy-50' : ''
                      }`}
                    >
                      {col.field === 'status' ? (
                        <select
                          value={value(tree, col.field)}
                          onChange={(e) => setCell(tree.tree_id, col.field, e.target.value)}
                          className={cell}
                        >
                          {TREE_STATUSES.map((s: TreeStatus) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={value(tree, col.field)}
                          onChange={(e) => setCell(tree.tree_id, col.field, e.target.value)}
                          onPaste={(e) => handlePaste(e, rowIndex, colIndex)}
                          placeholder={col.field === 'planted_date' ? 'YYYY-MM-DD' : undefined}
                          className={cell}
                          aria-label={`${col.label} for tree ${tree.tree_no ?? tree.tree_id}`}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
