'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ClientTree } from '@/lib/types';
import { TREE_STATUSES } from '@/lib/types';
import { STATUS_LABEL } from '@/components/StatusBadge';
import { filterTrees, describeFilter, type GroupFilter } from '@/lib/group-filter';
import { normalizeRowId } from '@/lib/row-id';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Undo2 } from 'lucide-react';

const EVENT_OPTIONS = [
  { value: 'spray', label: 'Sprayed' },
  { value: 'fertilize', label: 'Fertilized' },
  { value: 'pruning', label: 'Pruned' },
  { value: 'observation', label: 'Observation' },
  { value: 'harvest', label: 'Harvested' },
  { value: 'note', label: 'Note' },
];

const FIELD_OPTIONS = [
  { value: 'status', label: 'Status' },
  { value: 'variety', label: 'Variety' },
  { value: 'rootstock', label: 'Rootstock' },
  { value: 'source', label: 'Source (nursery)' },
  { value: 'block_id', label: 'Block' },
  { value: 'planted_date', label: 'Planted date' },
  { value: 'acquired_date', label: 'Acquired date' },
];

/** Confirmation is required above this group size for field changes. */
const CONFIRM_THRESHOLD = 50;

interface RecentAction {
  id: number;
  action_kind: 'log_event' | 'set_field' | 'harvest';
  scope: { summary: string };
  event_type: string | null;
  field: string | null;
  value: string | null;
  detail: string | null;
  tree_count: number;
  created_at: string;
  undone_at: string | null;
}

function chip(active: boolean) {
  return `px-2.5 py-1.5 rounded-lg text-xs font-medium border active:scale-[0.97] ${
    active
      ? 'bg-canopy-600 text-white border-canopy-600'
      : 'bg-paper text-ink border-line hover:bg-canopy-50'
  }`;
}

/**
 * Group actions: apply an event or a field change to any filtered set of
 * trees (rows / variety / status / block, AND-composed) with a live
 * count preview, plus the recent-actions undo list. Phone-friendly.
 */
export default function GroupActionDialog({
  open,
  onOpenChange,
  orchardId,
  trees,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orchardId: string;
  trees: ClientTree[];
  onApplied: () => void;
}) {
  const [filter, setFilter] = useState<GroupFilter>({});
  const [kind, setKind] = useState<'log_event' | 'set_field' | 'harvest'>('log_event');
  // harvest fields
  const todayYMD = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [harvestDate, setHarvestDate] = useState(todayYMD());
  const [weightLbs, setWeightLbs] = useState('');
  const [sugar, setSugar] = useState('');
  const [ph, setPh] = useState('');
  const [sugarUnit, setSugarUnit] = useState<'brix' | 'sg'>('brix');
  const [eventType, setEventType] = useState('spray');
  const [detail, setDetail] = useState('');
  const [field, setField] = useState('status');
  const [value, setValue] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentAction[]>([]);

  const rows = useMemo(() => {
    const set = new Set<string>();
    for (const t of trees) if (t.row_id) set.add(normalizeRowId(t.row_id));
    return [...set].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  }, [trees]);
  const varieties = useMemo(() => {
    const set = new Set<string>();
    for (const t of trees) if (t.variety) set.add(t.variety);
    return [...set].sort();
  }, [trees]);
  const blocks = useMemo(() => {
    const set = new Set<string>();
    for (const t of trees) if (t.block_id) set.add(t.block_id);
    return [...set].sort();
  }, [trees]);
  const fruitTypes = useMemo(() => {
    const set = new Set<string>();
    for (const t of trees) if (t.fruit_type) set.add(t.fruit_type);
    return [...set].sort();
  }, [trees]);

  const matched = useMemo(() => filterTrees(trees, filter), [trees, filter]);

  const loadRecent = () => {
    fetch(`/api/group-actions?orchard_id=${encodeURIComponent(orchardId)}`)
      .then((r) => r.json())
      .then((b) => setRecent(b.actions ?? []))
      .catch(() => {});
  };
  // Callers mount this with key/conditional render per open, so state
  // starts fresh; the effect only fetches (async setState is fine).
  useEffect(() => {
    if (open) {
      loadRecent();
      fetch('/api/settings')
        .then((r) => r.json())
        .then((b) => b?.walk?.sugarUnit === 'sg' && setSugarUnit('sg'))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (dim: keyof GroupFilter, v: string) =>
    setFilter((f) => {
      const cur = new Set(f[dim] ?? []);
      if (cur.has(v)) cur.delete(v);
      else cur.add(v);
      const next = [...cur];
      return { ...f, [dim]: next.length ? next : undefined };
    });

  const needsConfirm = kind === 'set_field' && matched.length > CONFIRM_THRESHOLD;
  const confirmOk = !needsConfirm || confirmText === String(matched.length);
  const harvestOk =
    kind !== 'harvest' || (Number(weightLbs) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(harvestDate));

  const apply = async () => {
    if (busy || matched.length === 0 || !confirmOk || !harvestOk) return;
    setBusy(true);
    setMessage(null);
    try {
      const sugarNum = Number(sugar);
      const sugarFields =
        sugar !== '' && Number.isFinite(sugarNum)
          ? sugarUnit === 'sg'
            ? { sg: sugarNum }
            : { brix: sugarNum }
          : {};
      const res = await fetch('/api/group-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchard_id: orchardId,
          filter,
          action:
            kind === 'log_event'
              ? { kind, event_type: eventType, detail: detail || undefined }
              : kind === 'harvest'
                ? {
                    kind,
                    harvest_date: harvestDate,
                    weight_lbs: Number(weightLbs),
                    ...sugarFields,
                    ph: ph !== '' && Number.isFinite(Number(ph)) ? Number(ph) : undefined,
                    detail: detail || undefined,
                  }
                : { kind, field, value: value || null },
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Failed');
      setMessage(`Applied to ${body.treeCount} trees.`);
      setDetail('');
      setValue('');
      setConfirmText('');
      loadRecent();
      onApplied();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to apply');
    } finally {
      setBusy(false);
    }
  };

  const undo = async (id: number) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/group-actions/${id}/undo`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Undo failed');
      setMessage(
        body.skipped > 0
          ? `Undone: ${body.reverted} reverted, ${body.skipped} skipped (changed since).`
          : `Undone: ${body.reverted} reverted.`
      );
      loadRecent();
      onApplied();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Undo failed');
    } finally {
      setBusy(false);
    }
  };

  const describeAction = (a: RecentAction) =>
    a.action_kind === 'harvest'
      ? `Harvested${a.detail ? ` — ${a.detail}` : ''}`
      : a.action_kind === 'log_event'
        ? `${EVENT_OPTIONS.find((o) => o.value === a.event_type)?.label ?? a.event_type}${a.detail ? ` — ${a.detail}` : ''}`
        : `${FIELD_OPTIONS.find((o) => o.value === a.field)?.label ?? a.field} → ${a.value ?? '(cleared)'}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Group action</DialogTitle>
          <DialogDescription>
            Pick which trees, then what happened. Filters combine.
          </DialogDescription>
        </DialogHeader>

        {/* ── Which trees ── */}
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-bark">Rows</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {rows.map((r) => (
                <button key={r} className={chip(!!filter.rows?.includes(r))} onClick={() => toggle('rows', r)}>
                  R{r.padStart(2, '0')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-bark">Variety</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {varieties.map((v) => (
                <button key={v} className={chip(!!filter.varieties?.includes(v))} onClick={() => toggle('varieties', v)}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <div>
              <Label className="text-xs text-bark">Status</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {TREE_STATUSES.map((s) => (
                  <button key={s} className={chip(!!filter.statuses?.includes(s))} onClick={() => toggle('statuses', s)}>
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
            {blocks.length > 0 && (
              <div>
                <Label className="text-xs text-bark">Block</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {blocks.map((b) => (
                    <button key={b} className={chip(!!filter.blocks?.includes(b))} onClick={() => toggle('blocks', b)}>
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {fruitTypes.length > 1 && (
              <div>
                <Label className="text-xs text-bark">Fruit</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {fruitTypes.map((ft) => (
                    <button
                      key={ft}
                      className={chip(!!filter.fruitTypes?.includes(ft))}
                      onClick={() => toggle('fruitTypes', ft)}
                    >
                      {ft}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <p className="text-sm font-medium text-ink">
            {matched.length} tree{matched.length === 1 ? '' : 's'} selected
            <span className="text-bark font-normal"> — {describeFilter(filter)}</span>
          </p>
        </div>

        {/* ── What happened ── */}
        <div className="border-t border-line pt-3 space-y-3">
          <div className="flex rounded-lg border border-line overflow-hidden">
            <button
              className={`flex-1 py-2 text-sm font-medium ${kind === 'log_event' ? 'bg-canopy-600 text-white' : 'bg-paper text-ink'}`}
              onClick={() => setKind('log_event')}
            >
              Log event
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium border-l border-line ${kind === 'harvest' ? 'bg-canopy-600 text-white' : 'bg-paper text-ink'}`}
              onClick={() => setKind('harvest')}
            >
              Harvest
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium border-l border-line ${kind === 'set_field' ? 'bg-canopy-600 text-white' : 'bg-paper text-ink'}`}
              onClick={() => setKind('set_field')}
            >
              Set field
            </button>
          </div>

          {kind === 'harvest' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-bark">Harvest date</Label>
                  <Input
                    type="date"
                    value={harvestDate}
                    onChange={(e) => setHarvestDate(e.target.value)}
                    className="h-10 mt-0.5"
                  />
                </div>
                <div>
                  <Label className="text-xs text-bark">Weight (lbs) *</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="e.g. 850"
                    value={weightLbs}
                    onChange={(e) => setWeightLbs(e.target.value)}
                    className="h-10 mt-0.5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-bark">
                    {sugarUnit === 'sg' ? 'Juice SG' : 'Juice Brix (°Bx)'}
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step={sugarUnit === 'sg' ? 0.001 : 0.1}
                    placeholder={sugarUnit === 'sg' ? '1.050' : '12.5'}
                    value={sugar}
                    onChange={(e) => setSugar(e.target.value)}
                    className="h-10 mt-0.5"
                  />
                </div>
                <div>
                  <Label className="text-xs text-bark">Juice pH</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step={0.01}
                    placeholder="3.4"
                    value={ph}
                    onChange={(e) => setPh(e.target.value)}
                    className="h-10 mt-0.5"
                  />
                </div>
              </div>
              <Input
                placeholder="Notes (e.g. destination, bins)"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                className="h-10"
              />
            </div>
          )}

          {kind === 'log_event' ? (
            <div className="grid grid-cols-2 gap-2">
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Detail (e.g. product & rate)"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                className="h-10"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Select value={field} onValueChange={(v) => { setField(v); setValue(''); }}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {field === 'status' ? (
                  <Select value={value} onValueChange={setValue}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="New status" /></SelectTrigger>
                    <SelectContent>
                      {TREE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={field.endsWith('_date') ? 'date' : 'text'}
                    placeholder="New value (empty clears)"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="h-10"
                  />
                )}
              </div>
              {needsConfirm && (
                <div>
                  <Label className="text-xs text-flag-600">
                    Changing {matched.length} trees — type {matched.length} to confirm
                  </Label>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    inputMode="numeric"
                    className="h-10 mt-1"
                  />
                </div>
              )}
            </div>
          )}

          {message && <p className="text-sm text-ink">{message}</p>}
          <Button
            className="w-full h-11"
            onClick={apply}
            disabled={busy || matched.length === 0 || !confirmOk || !harvestOk}
          >
            {busy
              ? 'Working…'
              : kind === 'harvest'
                ? `Record harvest from ${matched.length} trees`
                : `Apply to ${matched.length} trees`}
          </Button>
        </div>

        {/* ── Recent actions / undo ── */}
        {recent.length > 0 && (
          <div className="border-t border-line pt-3">
            <p className="survey-caption mb-2">Recent actions (24h)</p>
            <ul className="space-y-1.5">
              {recent.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className={a.undone_at ? 'line-through text-bark/60' : 'text-ink'}>
                    <span className="font-medium">{describeAction(a)}</span>
                    <span className="text-bark"> · {a.tree_count} trees · {a.scope.summary}</span>
                  </span>
                  {!a.undone_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 shrink-0"
                      disabled={busy}
                      onClick={() => undo(a.id)}
                    >
                      <Undo2 size={14} aria-hidden /> Undo
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
