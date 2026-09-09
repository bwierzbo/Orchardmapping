'use client';

import { useState } from 'react';
import type { ClientTree } from '@/lib/types';
import { TREE_STATUSES } from '@/lib/types';
import { formatYMD } from '@/lib/dates';
import StatusBadge, { STATUS_LABEL } from '@/components/StatusBadge';
import TreeHistory from './TreeHistory';
import type { TreeUpdateInput } from '@/lib/api/trees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

  // Selecting a different tree remounts the panel (key={tree_id} at the
  // call site), so edit state resets without a setState-in-effect.

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
      rootstock: tree.rootstock ?? '',
      source: tree.source ?? '',
      acquired_date: tree.acquired_date ?? '',
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
      acquired_date: form.acquired_date || undefined,
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
    <div className="space-y-1">
      <Label className="text-xs text-bark">{label}</Label>
      <Input
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
      />
    </div>
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
            {tree.variety ? (
              <a
                href={`/varieties/${encodeURIComponent(tree.variety)}`}
                target="_blank"
                rel="noreferrer"
                className="hover:text-canopy-700 hover:underline"
                title="Open in Variety Library"
              >
                {tree.variety}
              </a>
            ) : (
              tree.name || 'Tree'
            )}
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
            {field('Rootstock', tree.rootstock)}
            {field('Source', tree.source)}
            {field('Acquired', formatYMD(tree.acquired_date))}
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
            <TreeHistory key={tree.tree_id} treeId={tree.tree_id} canEdit={canEdit} />
          </>
        ) : (
          <div className="space-y-3">
            {input('Variety', 'variety')}
            <div className="space-y-1">
              <Label className="text-xs text-bark">Status</Label>
              <Select
                value={(form.status as string) ?? tree.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TREE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {input('Rootstock', 'rootstock')}
              {input('Source (nursery)', 'source')}
            </div>
            {input('Acquired', 'acquired_date', 'date')}
            {input('Planted', 'planted_date', 'date')}
            <div className="grid grid-cols-2 gap-3">
              {input('Age (years)', 'age', 'number')}
              {input('Height (m)', 'height', 'number')}
            </div>
            {input('Last pruned', 'last_pruned', 'date')}
            {input('Last harvest', 'last_harvest', 'date')}
            {input('Yield estimate (kg)', 'yield_estimate', 'number')}
            <div className="space-y-1">
              <Label className="text-xs text-bark">Notes</Label>
              <Textarea
                value={(form.notes as string) ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
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
            {canEdit && <Button onClick={startEdit}>Edit tree</Button>}
          </div>
        ) : confirmingDelete ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-destructive">Delete this tree?</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={onDelete} disabled={saving}>
                Delete
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete…
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
