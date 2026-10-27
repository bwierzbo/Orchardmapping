'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ClientTree } from '@/lib/types';
import { varietiesOf } from '@/lib/grafts';
import { TREE_STATUSES } from '@/lib/types';
import { STATUS_LABEL } from '@/components/StatusBadge';
import { filterTrees, describeFilter, type GroupFilter } from '@/lib/group-filter';
import { normalizeRowId } from '@/lib/address';
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
import { Apple, ArrowLeft, ClipboardList, Lasso, PenLine, Undo2 } from 'lucide-react';

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

type Kind = 'log_event' | 'set_field' | 'harvest';

/** What the dialog opens on: the actions, before any form. */
const KIND_CHOICES: { kind: Kind | 'select'; label: string; hint: string; icon: typeof Apple }[] = [
  { kind: 'log_event', label: 'Log event', hint: 'Sprayed, pruned, fertilized, a note', icon: ClipboardList },
  { kind: 'harvest', label: 'Harvest', hint: 'What came off a group of trees', icon: Apple },
  { kind: 'select', label: 'Select trees', hint: 'Draw round trees on the map, then edit them', icon: Lasso },
  { kind: 'set_field', label: 'Set field', hint: 'Status, variety, rootstock, block, dates', icon: PenLine },
];

const KIND_TITLE: Record<Kind, string> = {
  log_event: 'Log event',
  harvest: 'Harvest',
  set_field: 'Set field',
};

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
 * Group actions: opens on the four things it can do -- log an event,
 * record a harvest, select trees on the map, set a field -- then, for all
 * but selecting, which trees (rows / variety / status / block,
 * AND-composed) with a live count, and the form. The recent-actions undo
 * list is on the opening screen. Phone-friendly.
 */
export default function GroupActionDialog({
  open,
  onOpenChange,
  orchardId,
  trees,
  onApplied,
  onSelectTrees,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orchardId: string;
  trees: ClientTree[];
  onApplied: () => void;
  /** Start the map lasso. Left out where the lasso is not offered (phones). */
  onSelectTrees?: () => void;
}) {
  const [filter, setFilter] = useState<GroupFilter>({});
  /** Null is the opening screen: the choice of action, not yet a form. */
  const [kind, setKind] = useState<Kind | null>(null);

  // Reopening is a fresh action: a dialog that came back holding the last
  // group's filter would apply this harvest to the wrong trees.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKind(null);
      setFilter({});
    }
  }
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
    for (const t of trees) for (const v of varietiesOf(t)) set.add(v);
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

  const choose = (choice: Kind | 'select') => {
    if (choice === 'select') {
      onOpenChange(false);
      onSelectTrees?.();
      return;
    }
    setMessage(null);
    setKind(choice);
  };

  const needsConfirm = kind === 'set_field' && matched.length > CONFIRM_THRESHOLD;
  const confirmOk = !needsConfirm || confirmText === String(matched.length);
  const harvestOk =
    kind !== 'harvest' || (Number(weightLbs) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(harvestDate));

  const apply = async () => {
    if (!kind || busy || matched.length === 0 || !confirmOk || !harvestOk) return;
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
          <DialogTitle>{kind ? KIND_TITLE[kind] : 'Group action'}</DialogTitle>
          <DialogDescription>
            {kind
              ? 'Pick which trees, then what happened. Filters combine.'
              : 'What would you like to do?'}
          </DialogDescription>
        </DialogHeader>

        {/* ── Opening screen: the actions ── */}
        {kind === null && (
          <div className="grid grid-cols-2 gap-2">
            {KIND_CHOICES.filter((c) => c.kind !== 'select' || onSelectTrees).map((c) => (
              <button
                key={c.kind}
                type="button"
                onClick={() => choose(c.kind)}
                className="flex flex-col items-start gap-1 rounded-lg border border-line bg-paper p-3 text-left hover:bg-canopy-50 active:scale-[0.98]"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  <c.icon aria-hidden size={16} className="text-canopy-600" />
                  {c.label}
                </span>
                <span className="text-xs text-bark">{c.hint}</span>
              </button>
            ))}
          </div>
        )}

        {kind !== null && (
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setKind(null);
            }}
            className="inline-flex items-center gap-1 self-start text-xs text-bark hover:text-ink"
          >
            <ArrowLeft aria-hidden size={13} /> All actions
          </button>
        )}

        {/* ── Which trees ── */}
        {kind !== null && (
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
        )}

        {/* ── What happened ── */}
        {kind !== null && (
        <div className="border-t border-line pt-3 space-y-3">

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

          {kind === 'harvest' ? null : kind === 'log_event' ? (
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
        )}

        {/* ── Recent actions / undo ── */}
        {kind === null && message && <p className="text-sm text-ink">{message}</p>}
        {kind === null && recent.length > 0 && (
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
