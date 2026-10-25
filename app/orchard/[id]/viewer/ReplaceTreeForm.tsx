'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { ClientTree } from '@/lib/types';
import { dateToYMD } from '@/lib/dates';
import { formatAddress } from '@/lib/address';
import { replacementProblems } from '@/lib/tree-replacement';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import VarietyPicker from './VarietyPicker';
import SpeciesPicker from './SpeciesPicker';

/**
 * Take this tree out and record what went in its spot.
 *
 * The old tree is not deleted or edited into the new one: it keeps its
 * variety and its history, and the new tree, with the next number, points
 * back at it. The planted date follows the removal date until it is changed,
 * because the usual case is one trip -- the old tree out, the new one in.
 */
export default function ReplaceTreeForm({
  tree,
  onCancel,
  onReplaced,
}: {
  tree: ClientTree;
  onCancel: () => void;
  /** The new tree's id, so the panel can open it. */
  onReplaced: (plantedTreeId: string) => void;
}) {
  const today = dateToYMD(new Date());
  const [removedOn, setRemovedOn] = useState(today);
  const [plantedOn, setPlantedOn] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [fruitType, setFruitType] = useState(tree.fruit_type ?? '');
  const [variety, setVariety] = useState('');
  const [rootstock, setRootstock] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);

  const input = {
    removedOn,
    plantedOn: plantedOn ?? removedOn,
    reason,
    variety,
    fruitType,
    rootstock,
    source,
  };
  const problems = replacementProblems(input, today);

  const submit = async () => {
    setSaving(true);
    try {
      const { planted } = await trpc.tree.replace.mutate({ treeId: tree.tree_id, today, ...input });
      toast.success(`Tree ${planted.tree_no} · ${planted.variety} planted at ${formatAddress(planted)}`);
      onReplaced(planted.tree_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not replace this tree');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-bark">
        Tree {tree.tree_no ?? tree.tree_id} ({tree.variety ?? 'unknown variety'}) is kept with its
        history and taken off the map. The new tree gets the next number and this spot,{' '}
        {formatAddress(tree)}.
      </p>

      <div className="space-y-2 rounded-lg border border-line p-3">
        <p className="survey-caption text-bark">The old tree</p>
        <div className="space-y-1">
          <Label className="text-xs text-bark" htmlFor="replace-removed-on">Taken out on</Label>
          <Input
            id="replace-removed-on"
            type="date"
            max={today}
            value={removedOn}
            onChange={(e) => setRemovedOn(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-bark" htmlFor="replace-reason">Why</Label>
          <Input
            id="replace-reason"
            value={reason}
            maxLength={500}
            placeholder="Snapped in half, canker, wrong variety…"
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-line p-3">
        <p className="survey-caption text-bark">The new tree</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-bark">Species</Label>
            <SpeciesPicker
              orchardId={tree.orchard_id}
              value={fruitType}
              onChange={setFruitType}
              placeholder="apple"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-bark">Variety</Label>
            <VarietyPicker
              orchardId={tree.orchard_id}
              value={variety}
              onChange={setVariety}
              fruitType={fruitType}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-bark" htmlFor="replace-planted-on">Planted on</Label>
          <Input
            id="replace-planted-on"
            type="date"
            min={removedOn}
            max={today}
            value={plantedOn ?? removedOn}
            onChange={(e) => setPlantedOn(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-bark" htmlFor="replace-rootstock">Rootstock</Label>
            <Input id="replace-rootstock" value={rootstock} onChange={(e) => setRootstock(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-bark" htmlFor="replace-source">Source (nursery)</Label>
            <Input id="replace-source" value={source} onChange={(e) => setSource(e.target.value)} />
          </div>
        </div>
      </div>

      {problems.length > 0 && (
        <ul className="text-xs text-bark list-disc pl-4">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving || problems.length > 0}>
          {saving ? 'Replacing…' : 'Replace tree'}
        </Button>
      </div>
    </div>
  );
}
