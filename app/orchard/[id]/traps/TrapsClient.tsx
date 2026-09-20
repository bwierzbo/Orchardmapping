'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { TRAP_TYPES, type TrapType } from '@/lib/traps';
import { formatYMD } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Trap {
  id: number;
  trapType: TrapType;
  label: string;
  locationNote: string | null;
  lng: number | null;
  lat: number | null;
  deployedOn: string;
  removedOn: string | null;
  lastCountedOn: string | null;
  lastCount: number | null;
  seasonTotal: number;
}

/**
 * The weekly round: walk the traps, type what was on each one.
 *
 * Counts are entered per trap rather than per type, because a threshold
 * is "N per trap" — one loaded trap at the wild-host end of the block is
 * the signal, and averaging it against a quiet one would hide it.
 */
export default function TrapsClient({
  orchardId,
  traps,
  today,
  canEdit,
  notes,
  labels,
}: {
  orchardId: string;
  traps: Trap[];
  today: string;
  canEdit: boolean;
  notes: Record<TrapType, string>;
  labels: Record<TrapType, string>;
}) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [countedOn, setCountedOn] = useState(today);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTrap, setNewTrap] = useState({
    trapType: 'red_sphere' as TrapType,
    label: '',
    locationNote: '',
  });

  const active = traps.filter((t) => !t.removedOn);
  const retired = traps.filter((t) => t.removedOn);

  const saveCounts = async () => {
    const entries = Object.entries(counts)
      .map(([id, v]) => ({ trapId: Number(id), count: Number(v) }))
      .filter((e) => Number.isFinite(e.count) && e.count >= 0 && String(counts[e.trapId]) !== '');
    if (entries.length === 0) {
      toast.error('Nothing entered yet');
      return;
    }
    setSaving(true);
    try {
      await trpc.trap.recordCounts.mutate({ orchardId, countedOn, entries });
      toast.success(`${entries.length} trap${entries.length === 1 ? '' : 's'} recorded`);
      setCounts({});
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record the counts');
    } finally {
      setSaving(false);
    }
  };

  const addTrap = async () => {
    if (!newTrap.label.trim()) {
      toast.error('Give the trap a name you will recognise in the row');
      return;
    }
    setSaving(true);
    try {
      await trpc.trap.add.mutate({
        orchardId,
        trapType: newTrap.trapType,
        label: newTrap.label.trim(),
        locationNote: newTrap.locationNote.trim() || undefined,
        deployedOn: today,
      });
      toast.success('Trap added');
      setNewTrap({ trapType: 'red_sphere', label: '', locationNote: '' });
      setAdding(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add the trap');
    } finally {
      setSaving(false);
    }
  };

  const retire = async (id: number) => {
    try {
      await trpc.trap.retire.mutate({ id, removedOn: today });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not take it down');
    }
  };

  return (
    <section className="bg-surface border border-line rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg text-ink">
          {active.length > 0 ? 'This week’s round' : 'No traps out'}
        </h2>
        {canEdit && !adding && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden /> Add a trap
          </Button>
        )}
      </div>

      {adding && (
        <div className="mt-3 border border-line rounded-md p-3 bg-paper grid gap-2 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Type</Label>
            <select
              value={newTrap.trapType}
              onChange={(e) => setNewTrap({ ...newTrap, trapType: e.target.value as TrapType })}
              className="w-full h-10 px-3 bg-surface text-ink border border-line rounded-md text-sm"
            >
              {TRAP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {labels[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={newTrap.label}
              onChange={(e) => setNewTrap({ ...newTrap, label: e.target.value })}
              placeholder="Sphere 1"
            />
          </div>
          <div>
            <Label className="text-xs">Where</Label>
            <Input
              value={newTrap.locationNote}
              onChange={(e) => setNewTrap({ ...newTrap, locationNote: e.target.value })}
              placeholder="North end, row 4"
            />
          </div>
          <p className="sm:col-span-3 text-[11px] text-bark">{notes[newTrap.trapType]}</p>
          <div className="sm:col-span-3 flex gap-2">
            <Button size="sm" onClick={addTrap} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" aria-hidden />} Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <>
          {canEdit && (
            <div className="mt-3 max-w-48">
              <Label className="text-xs">Counted on</Label>
              <Input
                type="date"
                value={countedOn}
                max={today}
                onChange={(e) => setCountedOn(e.target.value)}
              />
            </div>
          )}

          <ul className="mt-3 divide-y divide-line">
            {active.map((t) => (
              <li key={t.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="min-w-0 flex-1">
                  <p className="text-ink font-medium leading-tight">
                    {t.label}{' '}
                    <span className="text-bark font-normal text-xs">{labels[t.trapType]}</span>
                  </p>
                  <p className="text-[11px] text-bark">
                    {t.locationNote ? `${t.locationNote} · ` : ''}
                    {t.lastCountedOn
                      ? `last read ${formatYMD(t.lastCountedOn)} (${t.lastCount})`
                      : 'never read'}
                    {t.seasonTotal > 0 && ` · ${t.seasonTotal} this season`}
                    {t.lng == null && ' · not on the map yet'}
                  </p>
                </div>
                {canEdit && (
                  <>
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="w-20"
                      placeholder="—"
                      aria-label={`Count for ${t.label}`}
                      value={counts[t.id] ?? ''}
                      onChange={(e) => setCounts({ ...counts, [t.id]: e.target.value })}
                    />
                    <Button size="sm" variant="ghost" onClick={() => retire(t.id)}>
                      Take down
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>

          {canEdit && (
            <Button className="mt-3" onClick={saveCounts} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" aria-hidden />}
              Record counts
            </Button>
          )}
        </>
      )}

      {retired.length > 0 && (
        <p className="survey-caption mt-4">
          Taken down: {retired.map((t) => `${t.label} (${formatYMD(t.removedOn!)})`).join(' · ')}
        </p>
      )}
    </section>
  );
}
