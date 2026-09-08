'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ClientTree, TreeStatus } from '@/lib/types';
import { STATUS_COLORS } from '@/lib/trees-geojson';
import { STATUS_LABEL } from '@/components/StatusBadge';
import { createTreeEvent } from '@/lib/api/trees';
import { serpentineOrder, varietySamplePath } from '@/lib/serpentine';
import {
  bloomStagesFor,
  FRUIT_METRIC_CATALOG,
  type WalkSettings,
} from '@/lib/settings';
import { ArrowLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type WalkPass = 'health' | 'bloom' | 'fruit';

const PASS_LABEL: Record<WalkPass, string> = {
  health: 'Health',
  bloom: 'Bloom',
  fruit: 'Fruit',
};

const STRESS_REASONS = [
  'Pests',
  'Disease',
  'Deer/Vole',
  'Drought',
  'Broken/Leaning',
  'Other',
];

interface WalkModeProps {
  trees: ClientTree[];
  settings: WalkSettings;
  /** Where to begin — e.g. the currently selected tree; null starts at the top. */
  startTreeId: string | null;
  onSetStatus: (treeId: string, status: TreeStatus) => Promise<boolean>;
  /** Pan the map + highlight the current tree. */
  onFocusTree: (tree: ClientTree) => void;
  onExit: () => void;
}

/**
 * Field survey mode: one thumb-tap per tree, auto-advancing along a
 * serpentine path. The button deck depends on the pass:
 *  - health: Healthy/Dead one-tap; Stressed asks for a reason first
 *  - bloom:  phenology-stage chips (ladder from settings)
 *  - fruit:  1–5 crop load + the metrics enabled in settings
 * Bloom/fruit passes honor the survey-scope setting (per-tree or
 * first-N-of-each-variety-run sampling); health always walks every tree.
 */
export default function WalkMode({
  trees,
  settings,
  startTreeId,
  onSetStatus,
  onFocusTree,
  onExit,
}: WalkModeProps) {
  const [pass, setPass] = useState<WalkPass | null>(null);

  // Path is fixed at pass selection; edits during the walk don't reshuffle it
  const path = useMemo(() => {
    if (!pass) return [];
    if (pass !== 'health' && settings.surveyScope === 'variety_sample') {
      return varietySamplePath(trees, settings.sampleSize);
    }
    return serpentineOrder(trees);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pass]);

  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState(0);
  // health: stressed sub-entry
  const [stressOpen, setStressOpen] = useState(false);
  const [stressNote, setStressNote] = useState('');
  // shared note entry
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  // fruit: load selection + metric values
  const [fruitLoad, setFruitLoad] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<Record<string, string>>({});

  const current = path[index] ?? null;
  const liveCurrent = useMemo(
    () => (current ? trees.find((t) => t.tree_id === current.tree_id) ?? current : null),
    [trees, current]
  );

  useEffect(() => {
    if (current) onFocusTree(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, pass]);

  // Pass picker screen
  if (!pass) {
    return (
      <Sheet onExit={onExit} header={<p className="text-base font-semibold text-ink">What are you surveying?</p>}>
        <div className="grid grid-cols-3 gap-2 px-4 pb-2">
          {(Object.keys(PASS_LABEL) as WalkPass[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPass(p);
                setIndex(() => {
                  if (!startTreeId) return 0;
                  const source =
                    p !== 'health' && settings.surveyScope === 'variety_sample'
                      ? varietySamplePath(trees, settings.sampleSize)
                      : serpentineOrder(trees);
                  const i = source.findIndex((t) => t.tree_id === startTreeId);
                  return i >= 0 ? i : 0;
                });
              }}
              className="h-16 rounded-xl bg-canopy-600 text-white font-semibold text-sm shadow-md active:scale-[0.97] hover:bg-canopy-700"
            >
              {PASS_LABEL[p]}
            </button>
          ))}
        </div>
        <p className="px-4 pb-4 text-xs text-bark">
          Health visits every tree.{' '}
          {settings.surveyScope === 'variety_sample'
            ? `Bloom & fruit sample the first ${settings.sampleSize} of each variety run (change in Settings).`
            : 'Bloom & fruit also visit every tree (change in Settings).'}
        </p>
      </Sheet>
    );
  }

  if (!current || path.length === 0) return null;

  const atEnd = index >= path.length - 1;

  const resetEntry = () => {
    setStressOpen(false);
    setStressNote('');
    setNoteOpen(false);
    setNote('');
    setFruitLoad(null);
    setMetrics({});
  };

  const advance = () => {
    resetEntry();
    if (atEnd) onExit();
    else setIndex((i) => i + 1);
  };

  const recordStatus = async (status: TreeStatus, detail?: string) => {
    if (busy) return;
    setBusy(true);
    const ok = await onSetStatus(current.tree_id, status);
    if (ok && detail) {
      try {
        await createTreeEvent(current.tree_id, { event_type: 'observation', detail });
      } catch {
        /* status is saved; observation is best-effort */
      }
    }
    setBusy(false);
    if (ok) {
      setRecorded((n) => n + 1);
      advance();
    }
  };

  const recordBloom = async (stage: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await createTreeEvent(current.tree_id, {
        event_type: 'bloom',
        detail: stage,
        changes: { stage },
      });
      setRecorded((n) => n + 1);
      advance();
    } finally {
      setBusy(false);
    }
  };

  const recordFruit = async () => {
    if (busy || fruitLoad === null) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { load: fruitLoad };
      for (const m of FRUIT_METRIC_CATALOG) {
        const raw = metrics[m.key];
        if (raw !== undefined && raw !== '' && !Number.isNaN(Number(raw))) {
          payload[m.key] = Number(raw);
        }
      }
      await createTreeEvent(current.tree_id, {
        event_type: 'fruit_check',
        detail: `Load ${fruitLoad}/5`,
        changes: payload,
      });
      setRecorded((n) => n + 1);
      advance();
    } finally {
      setBusy(false);
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
    } finally {
      setBusy(false);
    }
  };

  const enabledMetrics = FRUIT_METRIC_CATALOG.filter((m) =>
    settings.fruitMetrics.includes(m.key)
  );

  return (
    <Sheet
      onExit={onExit}
      header={
        <>
          <p className="font-mono text-xs text-bark tracking-wide">
            {PASS_LABEL[pass]} · R{current.row_id} · P{current.position} — {index + 1}/{path.length}
          </p>
          <p className="text-base font-semibold text-ink truncate">
            {current.variety || 'Unknown variety'}
          </p>
          <p className="text-xs text-bark">
            now: {STATUS_LABEL[liveCurrent?.status ?? current.status]} · recorded {recorded}
          </p>
        </>
      }
      onBack={index > 0 && !busy ? () => setIndex((i) => i - 1) : undefined}
    >
      {/* ── Pass-specific deck ── */}
      {pass === 'health' && !stressOpen && (
        <div className="grid grid-cols-3 gap-2 px-4 pb-2">
          <TapButton color={STATUS_COLORS.healthy} onClick={() => recordStatus('healthy')} disabled={busy}>
            Healthy
          </TapButton>
          <TapButton color={STATUS_COLORS.stressed} onClick={() => setStressOpen(true)} disabled={busy}>
            Stressed
          </TapButton>
          <TapButton color={STATUS_COLORS.dead} onClick={() => recordStatus('dead')} disabled={busy}>
            Dead
          </TapButton>
        </div>
      )}

      {pass === 'health' && stressOpen && (
        <div className="px-4 pb-2 space-y-2">
          <p className="text-xs font-medium text-bark">Why stressed?</p>
          <div className="flex flex-wrap gap-1.5">
            {STRESS_REASONS.map((r) => (
              <button
                key={r}
                onClick={() =>
                  recordStatus('stressed', stressNote.trim() ? `${r}: ${stressNote.trim()}` : r)
                }
                disabled={busy}
                className="px-3 py-2 rounded-lg text-sm font-medium border border-line text-ink bg-paper hover:bg-canopy-50 active:scale-[0.97]"
              >
                {r}
              </button>
            ))}
          </div>
          <Input
            placeholder="Detail (optional, tap a reason to save)"
            value={stressNote}
            onChange={(e) => setStressNote(e.target.value)}
            className="h-10"
          />
        </div>
      )}

      {pass === 'bloom' && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {bloomStagesFor(settings).map((stage) => (
            <button
              key={stage}
              onClick={() => recordBloom(stage)}
              disabled={busy}
              className="px-3 py-2.5 rounded-lg text-sm font-medium bg-canopy-600 text-white hover:bg-canopy-700 active:scale-[0.97] disabled:opacity-50"
            >
              {stage}
            </button>
          ))}
        </div>
      )}

      {pass === 'fruit' && (
        <div className="px-4 pb-2 space-y-2">
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setFruitLoad(n)}
                disabled={busy}
                className={`h-12 rounded-xl font-semibold text-base active:scale-[0.97] ${
                  fruitLoad === n
                    ? 'bg-canopy-600 text-white'
                    : 'bg-paper border border-line text-ink hover:bg-canopy-50'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-bark -mt-1">Crop load: 1 = none · 5 = heavy</p>
          {fruitLoad !== null && enabledMetrics.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {enabledMetrics.map((m) => (
                <label key={m.key} className="block">
                  <span className="text-[11px] font-medium text-bark">
                    {m.label} ({m.unit})
                  </span>
                  <Input
                    type="number"
                    step={m.step}
                    inputMode="decimal"
                    value={metrics[m.key] ?? ''}
                    onChange={(e) => setMetrics((prev) => ({ ...prev, [m.key]: e.target.value }))}
                    className="h-10 mt-0.5"
                  />
                </label>
              ))}
            </div>
          )}
          {fruitLoad !== null && (
            <Button className="w-full h-11" onClick={recordFruit} disabled={busy}>
              {busy ? 'Saving…' : 'Record & next'}
            </Button>
          )}
        </div>
      )}

      {/* ── Shared secondary actions ── */}
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
          {stressOpen ? (
            <Button
              variant="secondary"
              className="h-11 flex-1"
              onClick={() => setStressOpen(false)}
              disabled={busy}
            >
              Back
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="h-11 flex-1"
              onClick={() => setNoteOpen(true)}
              disabled={busy}
            >
              + Note
            </Button>
          )}
          <Button variant="secondary" className="h-11 flex-1" onClick={advance} disabled={busy}>
            {atEnd ? 'Finish' : 'Skip'} <ChevronRight size={16} aria-hidden />
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function TapButton({
  color,
  onClick,
  disabled,
  children,
}: {
  color: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-14 rounded-xl text-white font-semibold text-sm shadow-md active:scale-[0.97] disabled:opacity-50"
      style={{ backgroundColor: color }}
    >
      {children}
    </button>
  );
}

function Sheet({
  header,
  onExit,
  onBack,
  children,
}: {
  header: React.ReactNode;
  onExit: () => void;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 bg-surface border-t border-line shadow-2xl
                 rounded-t-2xl pb-safe md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[440px] md:rounded-2xl md:bottom-4 md:border"
      role="region"
      aria-label="Walk mode"
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <button
          onClick={onBack}
          disabled={!onBack}
          aria-label="Previous tree"
          className="p-2 -m-1 rounded-lg text-bark hover:text-ink hover:bg-canopy-50 disabled:opacity-30"
        >
          <ArrowLeft size={20} aria-hidden />
        </button>
        <div className="text-center min-w-0">{header}</div>
        <button
          onClick={onExit}
          aria-label="Exit walk mode"
          className="p-2 -m-1 rounded-lg text-bark hover:text-ink hover:bg-canopy-50"
        >
          <X size={20} aria-hidden />
        </button>
      </div>
      {children}
    </div>
  );
}
