'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ClientTree, TreeStatus } from '@/lib/types';
import { STATUS_COLORS } from '@/lib/trees-geojson';
import { createTreeEvent } from '@/lib/api/trees';
import { sgToBrix } from '@/lib/sugar';
import { bloomStagesFor, FRUIT_METRIC_CATALOG, type WalkSettings } from '@/lib/settings';
import type { WalkInspection } from '@/lib/walk-progress';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PhotoButton from '@/components/PhotoButton';

export const STRESS_REASONS = [
  'Pests',
  'Disease',
  'Deer/Vole',
  'Drought',
  'Broken/Leaning',
  'Other',
];

export interface InspectionAnswers {
  health: TreeStatus | null;
  stressReason: string | null;
  bloom: string | null;
  fruit: number | null;
  metrics: Record<string, string>;
  note: string;
}

export interface InspectionSaved {
  /** Inspections + observations written (the walk's "recorded" counter). */
  saved: number;
  /** At least one of health / bloom / fruit was recorded (the tree counts as assessed). */
  inspected: boolean;
  /** True when this was a photo, not the record button (a walk stays on the tree). */
  photo: boolean;
}

/**
 * Write one tree's inspection to the database — the single path shared
 * by Walk Mode and the tree panel, so a status tapped on the map and one
 * tapped mid-walk land as the same status update + tree events:
 *  - health → status update, plus an observation carrying the key issue
 *    (stressed) and/or the note as "Reason: note";
 *  - bloom → a bloom event with the stage;
 *  - fruit → a fruit_check event with load 1–5 and any detailed metrics
 *    (sugar stored as °Bx, with the entered SG kept alongside);
 *  - a note with no health answer → its own observation.
 */
export async function saveInspection(
  tree: ClientTree,
  answers: InspectionAnswers,
  settings: WalkSettings,
  onSetStatus: (treeId: string, status: TreeStatus) => Promise<boolean>
): Promise<InspectionSaved> {
  const noteText = answers.note.trim();
  let saved = 0;
  let noteUsed = false;
  if (answers.health) {
    const ok = await onSetStatus(tree.tree_id, answers.health);
    if (ok) {
      saved++;
      const reason = answers.health === 'stressed' ? answers.stressReason : null;
      const detail = reason ? (noteText ? `${reason}: ${noteText}` : reason) : noteText || null;
      if (detail) {
        noteUsed = true;
        try {
          await createTreeEvent(tree.tree_id, { event_type: 'observation', detail });
          saved++;
        } catch {
          /* status is saved; observation is best-effort */
        }
      }
    }
  }
  if (answers.bloom) {
    await createTreeEvent(tree.tree_id, {
      event_type: 'bloom',
      detail: answers.bloom,
      changes: { stage: answers.bloom },
    });
    saved++;
  }
  if (answers.fruit !== null) {
    const payload: Record<string, unknown> = { load: answers.fruit };
    for (const m of FRUIT_METRIC_CATALOG) {
      const raw = answers.metrics[m.key];
      if (raw !== undefined && raw !== '' && !Number.isNaN(Number(raw))) {
        const value = Number(raw);
        if (m.key === 'brix' && settings.sugarUnit === 'sg') {
          payload.brix = Math.round(sgToBrix(value) * 10) / 10;
          payload.sg = value;
        } else {
          payload[m.key] = value;
        }
      }
    }
    await createTreeEvent(tree.tree_id, {
      event_type: 'fruit_check',
      detail: `Load ${answers.fruit}/5`,
      changes: payload,
    });
    saved++;
  }
  if (noteText && !noteUsed) {
    await createTreeEvent(tree.tree_id, { event_type: 'observation', detail: noteText });
    saved++;
  }
  return {
    saved,
    inspected: answers.health !== null || answers.bloom !== null || answers.fruit !== null,
    photo: false,
  };
}

interface InspectionEntryProps {
  tree: ClientTree;
  settings: WalkSettings;
  /** Which sections to show. */
  inspections: ReadonlySet<WalkInspection>;
  /** Show the optional fruit measurements enabled in Settings. */
  detailedFruit: boolean;
  /**
   * Walk mode: save the moment every shown inspection is answered.
   * Stressed and detailed fruit always wait for the button so there is
   * room to pick a key issue, type a note, or enter values.
   */
  autoSave: boolean;
  recordLabel: string;
  onSetStatus: (treeId: string, status: TreeStatus) => Promise<boolean>;
  onSaved: (result: InspectionSaved) => void;
  onBusyChange?: (busy: boolean) => void;
  /** Extra button(s) rendered next to the camera (the walk's Skip). */
  secondaryAction?: (busy: boolean) => ReactNode;
}

/**
 * One tree's inspection form — the same controls whether you reach it
 * from a walk or by tapping a dot on the map: Healthy / Stressed / Dead
 * with key-issue chips under Stressed, bloom stage, crop load 1–5 (plus
 * detailed metrics), an always-visible notes field, a camera, and the
 * record button. Mount with key={tree_id} so entries never bleed across
 * trees.
 */
export default function InspectionEntry({
  tree,
  settings,
  inspections,
  detailedFruit,
  autoSave,
  recordLabel,
  onSetStatus,
  onSaved,
  onBusyChange,
  secondaryAction,
}: InspectionEntryProps) {
  // Answers live in a ref so the auto-save check sees the latest values
  // regardless of render timing; the state mirrors drive the highlights.
  const answersRef = useRef<InspectionAnswers>({
    health: null,
    stressReason: null,
    bloom: null,
    fruit: null,
    metrics: {},
    note: '',
  });
  const [healthChoice, setHealthChoice] = useState<TreeStatus | null>(null);
  const [stressReason, setStressReason] = useState<string | null>(null);
  const [bloomChoice, setBloomChoice] = useState<string | null>(null);
  const [fruitLoad, setFruitLoad] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusyState] = useState(false);
  const setBusy = (b: boolean) => {
    setBusyState(b);
    onBusyChange?.(b);
  };
  // A parent disabling its own controls on busy must not be left stuck
  // if this form unmounts mid-save (the walk advances on save).
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await saveInspection(tree, answersRef.current, settings, onSetStatus);
      onSaved(result);
    } catch (err) {
      toast.error(err instanceof Error ? `Save failed: ${err.message}` : 'Save failed — try again');
    } finally {
      setBusy(false);
    }
  };

  const complete = () => {
    const a = answersRef.current;
    return (
      (!inspections.has('health') || a.health !== null) &&
      (!inspections.has('bloom') || a.bloom !== null) &&
      (!inspections.has('fruit') || a.fruit !== null)
    );
  };
  const maybeAutoSave = () => {
    if (autoSave && complete() && !detailedFruit && answersRef.current.health !== 'stressed') {
      void save();
    }
  };

  const pickHealth = (status: TreeStatus) => {
    answersRef.current.health = status;
    setHealthChoice(status);
    if (status !== 'stressed') {
      answersRef.current.stressReason = null;
      setStressReason(null);
    }
    maybeAutoSave();
  };
  const pickReason = (reason: string) => {
    const next = stressReason === reason ? null : reason;
    answersRef.current.stressReason = next;
    setStressReason(next);
  };
  const pickBloom = (stage: string) => {
    answersRef.current.bloom = stage;
    setBloomChoice(stage);
    maybeAutoSave();
  };
  const pickFruit = (load: number) => {
    answersRef.current.fruit = load;
    setFruitLoad(load);
    maybeAutoSave();
  };
  const setMetric = (key: string, value: string) => {
    answersRef.current.metrics = { ...answersRef.current.metrics, [key]: value };
    setMetrics(answersRef.current.metrics);
  };
  const changeNote = (value: string) => {
    answersRef.current.note = value;
    setNote(value);
  };

  const hasAnything =
    healthChoice !== null || bloomChoice !== null || fruitLoad !== null || note.trim() !== '';

  // Photo: an observation carrying the image (and the note, if typed).
  // Never auto-advances — a photo usually precedes a status tap.
  const savePhoto = async (url: string) => {
    try {
      await createTreeEvent(tree.tree_id, {
        event_type: 'observation',
        detail: note.trim() || undefined,
        photo_url: url,
      });
      changeNote('');
      onSaved({ saved: 1, inspected: false, photo: true });
      toast.success('Photo saved');
    } catch {
      toast.error('Photo uploaded but could not be attached — try again');
    }
  };

  const enabledMetrics = FRUIT_METRIC_CATALOG.filter((m) => settings.fruitMetrics.includes(m.key));
  const showLabels = inspections.size > 1;
  const sectionLabel = (label: string, done: boolean) => (
    <p className="text-[11px] font-semibold tracking-wide text-bark uppercase flex items-center gap-1">
      {label}
      {done && <Check size={12} aria-hidden className="text-canopy-600" />}
    </p>
  );

  return (
    <>
      <div className="space-y-3 px-4 pb-2">
        {/* ── Health ── */}
        {inspections.has('health') && (
          <div className="space-y-1.5">
            {showLabels && sectionLabel('Health', healthChoice !== null)}
            <div className="grid grid-cols-3 gap-2">
              <TapButton
                color={STATUS_COLORS.healthy}
                selected={healthChoice === 'healthy'}
                onClick={() => pickHealth('healthy')}
                disabled={busy}
              >
                Healthy
              </TapButton>
              <TapButton
                color={STATUS_COLORS.stressed}
                selected={healthChoice === 'stressed'}
                onClick={() => pickHealth('stressed')}
                disabled={busy}
              >
                Stressed
              </TapButton>
              <TapButton
                color={STATUS_COLORS.dead}
                selected={healthChoice === 'dead'}
                onClick={() => pickHealth('dead')}
                disabled={busy}
              >
                Dead
              </TapButton>
            </div>
            {healthChoice === 'stressed' && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-bark">Key issue (tap to highlight)</p>
                <div className="flex flex-wrap gap-1.5">
                  {STRESS_REASONS.map((r) => {
                    const on = stressReason === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => pickReason(r)}
                        aria-pressed={on}
                        disabled={busy}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border active:scale-[0.97] disabled:opacity-50 ${
                          on
                            ? 'bg-canopy-700 border-canopy-700 text-white ring-2 ring-canopy-600 ring-offset-1'
                            : 'border-line text-ink bg-paper hover:bg-canopy-50'
                        }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Bloom ── */}
        {inspections.has('bloom') && (
          <div className="space-y-1.5">
            {showLabels && sectionLabel('Bloom', bloomChoice !== null)}
            <div className="flex flex-wrap gap-1.5">
              {bloomStagesFor(settings).map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => pickBloom(stage)}
                  disabled={busy}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium active:scale-[0.97] disabled:opacity-50 ${
                    bloomChoice === stage
                      ? 'bg-canopy-700 text-white ring-2 ring-canopy-600 ring-offset-1'
                      : 'bg-canopy-600 text-white hover:bg-canopy-700'
                  }`}
                >
                  {stage}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Fruit ── */}
        {inspections.has('fruit') && (
          <div className="space-y-2">
            {showLabels && sectionLabel('Fruit load', fruitLoad !== null)}
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pickFruit(n)}
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
            {detailedFruit && enabledMetrics.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {enabledMetrics.map((m) => {
                  const asSg = m.key === 'brix' && settings.sugarUnit === 'sg';
                  return (
                    <label key={m.key} className="block">
                      <span className="text-[11px] font-medium text-bark">
                        {asSg ? 'SG (optional)' : `${m.label} (${m.unit}, optional)`}
                      </span>
                      <Input
                        type="number"
                        step={asSg ? 0.001 : m.step}
                        inputMode="decimal"
                        placeholder={asSg ? '1.050' : undefined}
                        value={metrics[m.key] ?? ''}
                        onChange={(e) => setMetric(m.key, e.target.value)}
                        className="h-10 mt-0.5"
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Notes: always available; saved with the tree's record ── */}
        <Input
          placeholder={
            healthChoice === 'stressed'
              ? 'Notes — what you see (optional)'
              : 'Notes (optional) — saved with this tree'
          }
          value={note}
          onChange={(e) => changeNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && hasAnything && !busy && void save()}
          disabled={busy}
          className="h-11"
          aria-label="Notes"
        />

        <Button className="w-full h-11" onClick={() => void save()} disabled={busy || !hasAnything}>
          {busy ? 'Saving…' : recordLabel}
        </Button>
      </div>

      <div className="flex gap-2 px-4 pb-4">
        <PhotoButton
          treeId={tree.tree_id}
          onUploaded={savePhoto}
          className={secondaryAction ? 'h-11 px-3.5' : 'h-11 flex-1'}
          label={secondaryAction ? undefined : 'Photo'}
        />
        {secondaryAction?.(busy)}
      </div>
    </>
  );
}

function TapButton({
  color,
  selected,
  onClick,
  disabled,
  children,
}: {
  color: string;
  selected?: boolean;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-14 rounded-xl text-white font-semibold text-sm shadow-md active:scale-[0.97] disabled:opacity-50 ${
        selected ? 'ring-2 ring-ink ring-offset-2' : ''
      }`}
      style={{ backgroundColor: color }}
    >
      {children}
    </button>
  );
}
