'use client';

import { useEffect, useState } from 'react';
import type { ClientTree, TreeStatus } from '@/lib/types';
import { TREE_STATUSES } from '@/lib/types';
import { formatYMD } from '@/lib/dates';
import StatusBadge, { STATUS_LABEL } from '@/components/StatusBadge';
import type { TreeUpdateInput } from '@/lib/api/trees';

interface TreeDetailPanelProps {
  tree: ClientTree;
  canEdit: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (patch: TreeUpdateInput) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}

/**
 * The one tree editor: curated read view + in-place edit form.
 * Right-side panel on desktop, bottom sheet on small screens.
 */
export default function TreeDetailPanel({
  tree,
  canEdit,
  saving,
  onClose,
  onSave,
  onDelete,
}: TreeDetailPanelProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [form, setForm] = useState<TreeUpdateInput>({});

  // Reset edit state when a different tree is selected
  useEffect(() => {
    setEditing(false);
    setConfirmingDelete(false);
    setForm({});
  }, [tree.tree_id]);

  const startEdit = () => {
    setForm({
      variety: tree.variety ?? '',
      status: tree.status,
      planted_date: tree.planted_date ?? '',
      age: tree.age ?? undefined,
      height: tree.height ?? undefined,
      last_pruned: tree.last_pruned ?? '',
      last_harvest: tree.last_harvest ?? '',
      yield_estimate: tree.yield_estimate ?? undefined,
      notes: tree.notes ?? '',
    });
    setEditing(true);
  };

  const submit = async () => {
    // Empty strings mean "clear" for text, but dates must be null-ed via undefined-skip
    const patch: TreeUpdateInput = {
      ...form,
      planted_date: form.planted_date || undefined,
      last_pruned: form.last_pruned || undefined,
      last_harvest: form.last_harvest || undefined,
    };
    const ok = await onSave(patch);
    if (ok) setEditing(false);
  };

  const field = (label: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return null;
    return (
      <div className="flex justify-between gap-3 py-1.5 border-b border-line last:border-0">
        <span className="text-sm text-bark">{label}</span>
        <span className="text-sm font-medium text-ink text-right">{value}</span>
      </div>
    );
  };

  const input = (
    label: string,
    key: keyof TreeUpdateInput,
    type: 'text' | 'date' | 'number' = 'text'
  ) => (
    <label className="block">
      <span className="text-xs font-medium text-bark">{label}</span>
      <input
        type={type}
        value={(form[key] as string | number | undefined) ?? ''}
        onChange={(e) =>
          setForm((f) => ({
            ...f,
            [key]:
              type === 'number'
                ? e.target.value === ''
                  ? undefined
                  : Number(e.target.value)
                : e.target.value,
          }))
        }
        className="mt-1 w-full text-sm px-2.5 py-1.5 border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-canopy-600"
      />
    </label>
  );

  return (
    <div
      role="dialog"
      aria-label={`Tree ${tree.tree_id}`}
      className="absolute z-20 bg-surface shadow-2xl border border-line flex flex-col
                 inset-x-0 bottom-0 max-h-[70vh] rounded-t-2xl
                 md:inset-x-auto md:right-4 md:top-20 md:bottom-auto md:w-96 md:max-h-[calc(100vh-7rem)] md:rounded-xl"
    >
      <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-line">
        <div>
          <p className="font-mono text-xs text-bark tracking-wide">
            R{tree.row_id ?? '—'} · P{tree.position ?? '—'}
          </p>
          <h2 className="text-lg font-semibold text-ink">
            {tree.variety || tree.name || 'Tree'}
          </h2>
          <div className="mt-1">
            <StatusBadge status={tree.status} />
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close tree details"
          className="p-2 -m-1 rounded-lg text-bark/70 hover:text-ink hover:bg-canopy-50"
        >
          <svg aria-hidden className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="overflow-y-auto px-5 py-3 flex-1">
        {!editing ? (
          <>
            {field('Planted', formatYMD(tree.planted_date))}
            {field('Block', tree.block_id)}
            {field('Age', tree.age != null ? `${tree.age} yr` : null)}
            {field('Height', tree.height != null ? `${tree.height} m` : null)}
            {field('Last pruned', formatYMD(tree.last_pruned))}
            {field('Last harvest', formatYMD(tree.last_harvest))}
            {field('Yield estimate', tree.yield_estimate != null ? `${tree.yield_estimate} kg` : null)}
            {tree.notes ? (
              <div className="py-2">
                <span className="text-sm text-bark">Notes</span>
                <p className="text-sm text-ink mt-0.5 whitespace-pre-wrap">{tree.notes}</p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-3">
            {input('Variety', 'variety')}
            <label className="block">
              <span className="text-xs font-medium text-bark">Status</span>
              <select
                value={(form.status as string) ?? tree.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="mt-1 w-full text-sm px-2.5 py-1.5 border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-canopy-600 bg-surface"
              >
                {TREE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            {input('Planted', 'planted_date', 'date')}
            <div className="grid grid-cols-2 gap-3">
              {input('Age (years)', 'age', 'number')}
              {input('Height (m)', 'height', 'number')}
            </div>
            {input('Last pruned', 'last_pruned', 'date')}
            {input('Last harvest', 'last_harvest', 'date')}
            {input('Yield estimate (kg)', 'yield_estimate', 'number')}
            <label className="block">
              <span className="text-xs font-medium text-bark">Notes</span>
              <textarea
                value={(form.notes as string) ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="mt-1 w-full text-sm px-2.5 py-1.5 border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-canopy-600"
              />
            </label>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-line space-y-2">
        {!editing ? (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => navigator.clipboard?.writeText(tree.tree_id)}
              className="font-mono text-xs text-bark/70 hover:text-ink"
              title="Copy tree ID"
            >
              {tree.tree_id}
            </button>
            {canEdit && (
              <button
                onClick={startEdit}
                className="px-4 py-2 bg-canopy-600 text-white text-sm font-medium rounded-lg hover:bg-canopy-700"
              >
                Edit tree
              </button>
            )}
          </div>
        ) : confirmingDelete ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-status-dead">Delete this tree?</span>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmingDelete(false)}
                className="px-3 py-1.5 text-sm rounded-lg bg-paper hover:bg-line"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                disabled={saving}
                className="px-3 py-1.5 text-sm rounded-lg bg-status-dead text-white hover:bg-status-dead/90 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setConfirmingDelete(true)}
              className="text-sm text-status-dead hover:text-status-dead"
            >
              Delete…
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-2 text-sm rounded-lg bg-paper hover:bg-line"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="px-4 py-2 bg-canopy-600 text-white text-sm font-medium rounded-lg hover:bg-canopy-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
