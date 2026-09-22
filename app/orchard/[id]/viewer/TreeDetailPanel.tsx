'use client';

import { useEffect, useState } from 'react';
import type { ClientTree, TreeStatus } from '@/lib/types';
import { TREE_STATUSES } from '@/lib/types';
import type { WalkSettings } from '@/lib/settings';
import { toast } from 'sonner';
import InspectionEntry from './InspectionEntry';
import { recordInspectionInSavedWalk } from '@/lib/api/walk-progress';
import { formatYMD } from '@/lib/dates';
import StatusBadge, { STATUS_LABEL } from '@/components/StatusBadge';
import TreeHistory from './TreeHistory';
import { formatAddress, formatTreeLabel } from '@/lib/address';
import { trpc } from '@/lib/trpc/client';
import VarietyPicker from './VarietyPicker';
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

/** The Inspect form offers every inspection; the surveyor answers what applies. */
const ALL_INSPECTIONS: ReadonlySet<'health' | 'bloom' | 'fruit'> = new Set([
  'health',
  'bloom',
  'fruit',
] as const);

interface TreeDetailPanelProps {
  tree: ClientTree;
  canEdit: boolean;
  saving: boolean;
  /** Walk-survey settings (bloom scale, fruit metrics) — the Inspect form shares them. */
  walkSettings: WalkSettings;
  onClose: () => void;
  onDelete: () => Promise<boolean>;
  onStartMove: () => void;
  /** Reload trees after an address change, which no longer alters the id. */
  onMoved: () => void;
  /** Status change from the Inspect form (same path as a walk). */
  onSetStatus: (treeId: string, status: TreeStatus) => Promise<boolean>;
}

/**
 * The one tree editor: curated read view + in-place edit form, plus an
 * "Inspect" mode that is the walk survey's per-tree form for just this
 * tree — same controls, same events — for spot checks from the map.
 * Right-side panel on desktop, bottom sheet on small screens.
 */
export default function TreeDetailPanel({
  tree,
  canEdit,
  saving,
  walkSettings,
  onClose,
  onDelete,
  onStartMove,
  onMoved,
  onSetStatus,
}: TreeDetailPanelProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // Suggested fruit types come from the orchard, not a hardcoded list
  const [fruitTypes, setFruitTypes] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    trpc.tree.fruitTypes
      .query({ orchardId: tree.orchard_id })
      .then((f) => {
        if (live) setFruitTypes(f);
      })
      .catch(() => {
        // Suggestions only; the field accepts any value regardless.
      });
    return () => {
      live = false;
    };
  }, [tree.orchard_id]);
  const [inspecting, setInspecting] = useState(false);
  const [inspectBusy, setInspectBusy] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [form, setForm] = useState<TreeUpdateInput>({});

  // Selecting a different tree remounts the panel (key={tree_id} at the
  // call site), so edit state resets without a setState-in-effect.

  const startEdit = () => {
    setForm({
      variety: tree.variety ?? '',
      fruit_type: tree.fruit_type ?? '',
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
      block_id: tree.block_id ?? '',
      row_id: tree.row_id ?? '',
      position: tree.position ?? '',
    });
    setEditing(true);
  };

  /** Fields the form can change, address included — one save, one approval. */
  const EDITABLE = [
    'block_id', 'row_id', 'position',
    'variety', 'fruit_type', 'status', 'rootstock', 'source', 'notes',
    'planted_date', 'acquired_date', 'last_pruned', 'last_harvest',
    'age', 'height', 'yield_estimate',
  ] as const;

  const submit = async () => {
    // Only what actually changed, so a field you merely looked at does
    // not appear in this tree's history as edited. Empty means cleared.
    const fields: Record<string, string | null> = {};
    for (const key of EDITABLE) {
      const raw = (form as Record<string, unknown>)[key];
      const next = raw === undefined || raw === '' ? null : String(raw);
      const before = (tree as unknown as Record<string, unknown>)[key];
      const current = before === undefined || before === null || before === '' ? null : String(before);
      if (next !== current) fields[key] = next;
    }
    if (Object.keys(fields).length === 0) {
      setEditing(false);
      return;
    }

    setBusy(true);
    try {
      // Same path as the grid editor: one transaction, the address
      // constraint deferred, a collision reported as a collision, and the
      // whole edit recorded as one entry in this tree's history.
      await trpc.tree.editMany.mutate({
        orchardId: tree.orchard_id,
        edits: [{ treeId: tree.tree_id, fields }],
      });
      toast.success('Saved');
      setEditing(false);
      onMoved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save this tree');
    } finally {
      setBusy(false);
    }
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
      aria-label={formatTreeLabel(tree)}
      className="absolute z-20 bg-surface shadow-2xl border border-line flex flex-col
                 inset-x-0 bottom-0 max-h-[70vh] rounded-t-2xl
                 md:inset-x-auto md:right-4 md:top-20 md:bottom-auto md:w-96 md:max-h-[calc(100vh-7rem)] md:rounded-xl"
    >
      <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-line">
        <div>
          <p className="font-mono text-xs text-bark tracking-wide">{formatAddress(tree)}</p>
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

      <div className={`overflow-y-auto flex-1 ${inspecting ? 'py-3' : 'px-5 py-3'}`}>
        {inspecting ? (
          <InspectionEntry
            key={tree.tree_id}
            tree={tree}
            settings={walkSettings}
            inspections={ALL_INSPECTIONS}
            detailedFruit
            autoSave={false}
            recordLabel="Record"
            onSetStatus={onSetStatus}
            onBusyChange={setInspectBusy}
            onSaved={({ saved, inspected, photo }) => {
              setHistoryVersion((v) => v + 1);
              if (photo) return;
              const where = `R${tree.row_id ?? '—'} P${tree.position ?? '—'}`;
              if (saved > 0) toast.success(`Recorded for ${where}`);
              setInspecting(false);
              // A paused walk covering this tree counts it as assessed
              if (inspected) {
                recordInspectionInSavedWalk(tree.orchard_id, tree.tree_id, saved)
                  .then((updated) => {
                    if (updated) toast.info(`${where} marked assessed on the paused walk`);
                  })
                  .catch(() => {});
              }
            }}
          />
        ) : !editing ? (
          <>
            {field('Fruit', tree.fruit_type)}
            {field('Rootstock', tree.rootstock)}
            {field('Source', tree.source)}
            {field('Acquired', formatYMD(tree.acquired_date))}
            {field('Planted', formatYMD(tree.planted_date))}
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
            <TreeHistory
              key={tree.tree_id}
              treeId={tree.tree_id}
              canEdit={canEdit}
              refreshKey={historyVersion}
            />
          </>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {input('Block', 'block_id')}
              {input('Row', 'row_id')}
              {input('Position', 'position')}
            </div>
            <p className="text-xs text-bark -mt-1">
              Leave all three blank to take this tree out of the layout without deleting it.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-bark">Variety</Label>
                <VarietyPicker
                  orchardId={tree.orchard_id}
                  value={(form.variety as string) ?? ''}
                  onChange={(v) => setForm((f) => ({ ...f, variety: v }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-bark">Fruit</Label>
                <Input
                  list="fruit-types"
                  value={(form.fruit_type as string) ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fruit_type: e.target.value.toLowerCase() }))
                  }
                  placeholder="apple"
                />
                <datalist id="fruit-types">
                  {fruitTypes.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </div>
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
        {inspecting ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-bark">Same form and records as a walk survey.</span>
            <Button
              variant="secondary"
              onClick={() => setInspecting(false)}
              disabled={inspectBusy}
            >
              Done
            </Button>
          </div>
        ) : !editing ? (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => navigator.clipboard?.writeText(tree.tree_id)}
              className="font-mono text-xs text-bark/70 hover:text-ink"
              title={`Copy tree ID (${tree.tree_id})`}
            >
              {tree.tree_no != null ? `Tree ${tree.tree_no}` : tree.tree_id}
            </button>
            {canEdit && (
              <div className="flex gap-2">
                {tree.lat != null && tree.lng != null && (
                  <Button variant="secondary" onClick={onStartMove}>
                    Move on map
                  </Button>
                )}
                <Button variant="secondary" onClick={startEdit}>
                  Edit tree
                </Button>
                <Button onClick={() => setInspecting(true)}>Inspect</Button>
              </div>
            )}
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
              <Button onClick={submit} disabled={saving || busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
