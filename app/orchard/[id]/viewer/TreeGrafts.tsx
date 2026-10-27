'use client';

import { useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import type { ClientTree } from '@/lib/types';
import { dateToYMD, formatYMD } from '@/lib/dates';
import {
  describeGraftPlace,
  GRAFT_STATUSES,
  GRAFT_STATUS_LABEL,
  graftProblems,
  SCAFFOLD_DIRECTIONS,
  SCAFFOLD_TIERS,
  type ClientGraft,
  type GraftInput,
} from '@/lib/grafts';
import { trpc } from '@/lib/trpc/client';
import PhotoButton from '@/components/PhotoButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import VarietyPicker from './VarietyPicker';

const TIER_NAME: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' };

/**
 * The varieties grafted onto a tree, below the tree's own.
 *
 * Each is placed the way it is found standing at the tree: which side of
 * the trunk its scaffold leaves from (eight compass points) and which tier,
 * the lowest being the first; then the tag on the limb if it has one, and
 * a photo. A graft that did not take, or was cut out, stays listed with
 * that status rather than being deleted, so its picks keep their variety.
 */
export default function TreeGrafts({
  tree,
  grafts,
  canEdit,
  onChanged,
}: {
  tree: ClientTree;
  /** Null while loading. */
  grafts: ClientGraft[] | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  /** The graft being edited, 'new' for one being added, null for none. */
  const [editing, setEditing] = useState<ClientGraft | 'new' | null>(null);

  if (grafts === null) return null;
  if (grafts.length === 0 && !canEdit) return null;

  return (
    <div className="py-2 border-t border-line space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-bark">Grafts</span>
        {canEdit && editing === null && (
          <Button variant="ghost" size="sm" onClick={() => setEditing('new')}>
            <Plus aria-hidden size={14} /> Add graft
          </Button>
        )}
      </div>
      {grafts.length === 0 && editing === null && (
        <p className="text-sm text-bark/60">
          Only {tree.variety ?? 'its own variety'}. Add a graft when another variety is grafted on.
        </p>
      )}
      {grafts.map((g) =>
        editing !== null && editing !== 'new' && editing.id === g.id ? (
          <GraftForm
            key={g.id}
            tree={tree}
            graft={g}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              onChanged();
            }}
          />
        ) : (
          <GraftCard
            key={g.id}
            graft={g}
            onEdit={canEdit && editing === null ? () => setEditing(g) : undefined}
          />
        )
      )}
      {editing === 'new' && (
        <GraftForm
          tree={tree}
          graft={null}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function GraftCard({ graft, onEdit }: { graft: ClientGraft; onEdit?: () => void }) {
  const place = describeGraftPlace(graft);
  const growing = graft.status === 'growing';
  return (
    <div className={`flex gap-3 rounded-lg border border-line p-2.5 ${growing ? '' : 'opacity-70'}`}>
      {graft.photo_url && (
        <a
          href={graft.photo_url}
          target="_blank"
          rel="noreferrer"
          className="relative shrink-0 w-16 h-16 overflow-hidden rounded-md border border-line"
        >
          <Image
            src={graft.photo_url}
            alt={`${graft.variety} graft`}
            fill
            sizes="64px"
            className="object-cover"
            unoptimized
          />
        </a>
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-ink">
          {graft.variety}
          {graft.tag && (
            <span className="ml-2 inline-block rounded-full border border-line px-2 py-0.5 text-xs font-normal text-bark">
              {graft.tag}
            </span>
          )}
        </p>
        {place && <p className="text-bark">{place}</p>}
        <p className="text-xs text-bark">
          {growing
            ? graft.grafted_on
              ? `Grafted ${formatYMD(graft.grafted_on)}`
              : 'Growing'
            : `${GRAFT_STATUS_LABEL[graft.status]}${graft.status_on ? ` ${formatYMD(graft.status_on)}` : ''}`}
        </p>
        {graft.notes && <p className="text-xs text-ink mt-0.5 whitespace-pre-wrap">{graft.notes}</p>}
      </div>
      {onEdit && (
        <Button variant="ghost" size="sm" onClick={onEdit} className="self-start">
          Edit
        </Button>
      )}
    </div>
  );
}

function GraftForm({
  tree,
  graft,
  onCancel,
  onSaved,
}: {
  tree: ClientTree;
  graft: ClientGraft | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const today = dateToYMD(new Date());
  const [form, setForm] = useState<GraftInput>(() => ({
    variety: graft?.variety ?? '',
    scaffold_direction: graft?.scaffold_direction ?? null,
    scaffold_tier: graft?.scaffold_tier ?? null,
    tag: graft?.tag ?? '',
    grafted_on: graft?.grafted_on ?? null,
    status: graft?.status ?? 'growing',
    status_on: graft?.status_on ?? null,
    photo_url: graft?.photo_url ?? null,
    notes: graft?.notes ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<GraftInput>) => setForm((f) => ({ ...f, ...patch }));
  const problems = graftProblems(form, today);

  const save = async () => {
    setSaving(true);
    try {
      if (graft) {
        await trpc.graft.update.mutate({ treeId: tree.tree_id, graftId: graft.id, today, graft: form });
        toast.success(`${form.variety} graft saved`);
      } else {
        await trpc.graft.create.mutate({ treeId: tree.tree_id, today, graft: form });
        toast.success(`${form.variety} graft added`);
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the graft');
    } finally {
      setSaving(false);
    }
  };

  const choice = (on: boolean) =>
    `h-10 rounded-lg border text-sm font-medium ${
      on ? 'bg-canopy-700 border-canopy-700 text-white' : 'bg-paper border-line text-ink hover:bg-canopy-50'
    }`;

  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <div className="space-y-1">
        <Label className="text-xs text-bark">Variety</Label>
        <VarietyPicker
          orchardId={tree.orchard_id}
          value={form.variety}
          onChange={(v) => set({ variety: v })}
          fruitType={tree.fruit_type ?? ''}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-bark">Scaffold — which side of the trunk</Label>
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Scaffold direction">
          {SCAFFOLD_DIRECTIONS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={form.scaffold_direction === d}
              onClick={() => set({ scaffold_direction: form.scaffold_direction === d ? null : d })}
              className={choice(form.scaffold_direction === d)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-bark">Tier — 1st is the lowest</Label>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Scaffold tier">
          {SCAFFOLD_TIERS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={form.scaffold_tier === t}
              onClick={() => set({ scaffold_tier: form.scaffold_tier === t ? null : t })}
              className={choice(form.scaffold_tier === t)}
            >
              {TIER_NAME[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-bark" htmlFor="graft-tag">Tag (if any)</Label>
          <Input
            id="graft-tag"
            value={form.tag ?? ''}
            maxLength={100}
            placeholder="Blue tape, #14…"
            onChange={(e) => set({ tag: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-bark" htmlFor="graft-on">Grafted</Label>
          <Input
            id="graft-on"
            type="date"
            max={today}
            value={form.grafted_on ?? ''}
            onChange={(e) => set({ grafted_on: e.target.value || null })}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-bark">Status</Label>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Graft status">
          {GRAFT_STATUSES.map((st) => (
            <button
              key={st}
              type="button"
              aria-pressed={form.status === st}
              onClick={() =>
                set({ status: st, status_on: st === 'growing' ? null : form.status_on ?? today })
              }
              className={choice(form.status === st)}
            >
              {GRAFT_STATUS_LABEL[st]}
            </button>
          ))}
        </div>
        {form.status !== 'growing' && (
          <Input
            type="date"
            aria-label="When"
            max={today}
            value={form.status_on ?? ''}
            onChange={(e) => set({ status_on: e.target.value || null })}
          />
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-bark">Photo of the limb</Label>
        <div className="flex items-center gap-2">
          {form.photo_url && (
            <span className="relative w-14 h-14 overflow-hidden rounded-md border border-line">
              <Image src={form.photo_url} alt="Graft" fill sizes="56px" className="object-cover" unoptimized />
            </span>
          )}
          <PhotoButton
            treeId={tree.tree_id}
            onUploaded={(url) => set({ photo_url: url })}
            label={form.photo_url ? 'Replace photo' : 'Add photo'}
            className="h-10 px-3"
          />
          {form.photo_url && (
            <Button variant="ghost" size="sm" onClick={() => set({ photo_url: null })}>
              Remove
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-bark" htmlFor="graft-notes">Notes</Label>
        <Input
          id="graft-notes"
          value={form.notes ?? ''}
          maxLength={2000}
          onChange={(e) => set({ notes: e.target.value })}
        />
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
        <Button onClick={save} disabled={saving || problems.length > 0}>
          {saving ? 'Saving…' : graft ? 'Save graft' : 'Add graft'}
        </Button>
      </div>
    </div>
  );
}
