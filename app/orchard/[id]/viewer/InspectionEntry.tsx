'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ClientTree, TreeStatus } from '@/lib/types';
import { STATUS_COLORS } from '@/lib/trees-geojson';
import { createTreeEvent } from '@/lib/api/trees';
import { sgToBrix } from '@/lib/sugar';
import { bloomStagesFor, FRUIT_METRIC_CATALOG, type WalkSettings } from '@/lib/settings';
import type { WalkInspection } from '@/lib/walk-progress';
import { Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PhotoButton from '@/components/PhotoButton';
import { trpc } from '@/lib/trpc/client';
import { splitForPicker, type PickablePest } from '@/lib/pest-picker';

export const STRESS_REASONS = [
  'Pests',
  'Disease',
  'Deer/Vole',
  'Drought',
  'Broken/Leaning',
  'Other',
];

export type PestSeverity = 'light' | 'moderate' | 'severe';
export const PEST_SEVERITIES: readonly PestSeverity[] = ['light', 'moderate', 'severe'];

export interface InspectionAnswers {
  health: TreeStatus | null;
  stressReason: string | null;
  bloom: string | null;
  fruit: number | null;
  metrics: Record<string, string>;
  /**
   * What was seen on this tree, by pest key. Deliberately independent of
   * health: a tree can be in good shape and still have codling moth on
   * it, and the whole point of scouting is to catch that before it is
   * bad enough to change the tree's status.
   */
  pests: Record<string, PestSeverity | null>;
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
  onSetStatus: (treeId: string, status: TreeStatus) => Promise<boolean>,
  /** Names for the pest keys, so the history line reads in English. */
  pestNames: ReadonlyMap<string, string> = new Map()
): Promise<InspectionSaved> {
  const noteText = answers.note.trim();
  const pestKeys = Object.keys(answers.pests);
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
  if (pestKeys.length > 0) {
    // Two writes, on purpose. pest_observations is the scouting record
    // the pest pages and the trap thresholds read; the tree event is
    // what puts "saw codling moth" in THIS tree's history, which is
    // where somebody standing at the tree next month will look.
    // The note lands once, on the first record that can carry it — the
    // health observation if there was one, otherwise here.
    const noteForPests = noteUsed ? undefined : noteText || undefined;
    const described: string[] = [];
    for (const key of pestKeys) {
      const severity = answers.pests[key];
      const name = pestNames.get(key) ?? key;
      described.push(severity ? `${name} (${severity})` : name);
      await trpc.pest.observe.mutate({
        orchardId: tree.orchard_id,
        pestKey: key,
        treeId: tree.tree_id,
        severity: severity ?? undefined,
        notes: noteForPests,
      });
      saved++;
    }
    if (noteForPests) noteUsed = true;
    await createTreeEvent(tree.tree_id, {
      event_type: 'observation',
      detail: `Seen on tree: ${described.join(', ')}`,
      changes: { pests: answers.pests },
    });
    saved++;
  }
  if (noteText && !noteUsed) {
    await createTreeEvent(tree.tree_id, { event_type: 'observation', detail: noteText });
    saved++;
  }
  return {
    saved,
    // Spotting a pest is an inspection. Without this, a tree you looked
    // hard enough at to find codling moth on would still read as never
    // visited on the coverage map.
    inspected:
      answers.health !== null ||
      answers.bloom !== null ||
      answers.fruit !== null ||
      pestKeys.length > 0,
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
  /**
   * Fired when there are answers entered but not yet recorded, so a
   * parent can stop the form being closed on top of them.
   */
  onDirtyChange?: (dirty: boolean) => void;
  /** Extra button(s) rendered next to the camera (the walk's Skip). */
  secondaryAction?: (busy: boolean) => ReactNode;
  /**
   * The pest library for this orchard, already ranked by the caller.
   * Empty or undefined hides the section rather than showing an empty
   * one — an orchard whose library has not loaded is not an orchard
   * with no pests.
   */
  pests?: readonly PickablePest[];
  /** How many of each have been logged here, for the ranking. */
  pestSightings?: Readonly<Record<string, number>>;
  /** False when the orchard has no region, so nothing ranks the list. */
  pestsRanked?: boolean;
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
  onDirtyChange,
  secondaryAction,
  pests,
  pestSightings,
  pestsRanked = true,
}: InspectionEntryProps) {
  // Answers live in a ref so the auto-save check sees the latest values
  // regardless of render timing; the state mirrors drive the highlights.
  const answersRef = useRef<InspectionAnswers>({
    health: null,
    stressReason: null,
    bloom: null,
    fruit: null,
    metrics: {},
    pests: {},
    note: '',
  });
  const [healthChoice, setHealthChoice] = useState<TreeStatus | null>(null);
  const [stressReason, setStressReason] = useState<string | null>(null);
  const [bloomChoice, setBloomChoice] = useState<string | null>(null);
  const [fruitLoad, setFruitLoad] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  const [pestsSeen, setPestsSeen] = useState<Record<string, PestSeverity | null>>({});
  const [showAllPests, setShowAllPests] = useState(false);

  const [note, setNote] = useState('');
  const pestNames = useMemo(
    () => new Map((pests ?? []).map((p) => [p.key, p.name])),
    [pests]
  );
  const pestPicker = useMemo(
    () => splitForPicker(pests ?? [], pestSightings ?? {}, Object.keys(pestsSeen)),
    [pests, pestSightings, pestsSeen]
  );
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
      const result = await saveInspection(
        tree,
        answersRef.current,
        settings,
        onSetStatus,
        pestNames
      );
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
    if (
      autoSave &&
      complete() &&
      !detailedFruit &&
      answersRef.current.health !== 'stressed' &&
      // A ticked pest means there is more to say — at the very least a
      // severity to set — so the button takes over from here.
      Object.keys(answersRef.current.pests).length === 0
    ) {
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
  const togglePest = (key: string) => {
    const next = { ...answersRef.current.pests };
    if (key in next) delete next[key];
    else next[key] = null;
    answersRef.current.pests = next;
    setPestsSeen(next);
  };
  const setPestSeverity = (key: string, severity: PestSeverity) => {
    const next = { ...answersRef.current.pests };
    // Tapping the level it already has clears it — "seen, severity not
    // stated" is a real answer and has to stay reachable.
    next[key] = next[key] === severity ? null : severity;
    answersRef.current.pests = next;
    setPestsSeen(next);
  };
  const changeNote = (value: string) => {
    answersRef.current.note = value;
    setNote(value);
  };

  const pestKeys = Object.keys(pestsSeen);
  const hasAnything =
    healthChoice !== null ||
    bloomChoice !== null ||
    fruitLoad !== null ||
    pestKeys.length > 0 ||
    note.trim() !== '';

  // Answers entered and not yet recorded. A photo saves on its own, so
  // this is what would be lost by walking away after taking one.
  const unsaved =
    healthChoice !== null || bloomChoice !== null || fruitLoad !== null ||
    pestKeys.length > 0 ||
    Object.values(metrics).some((v) => v !== '');

  useEffect(() => {
    onDirtyChange?.(unsaved);
  }, [unsaved, onDirtyChange]);
  // Leaving the form should not report a dirty state nobody can act on
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

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
      // A photo saves by itself and the rest does not. Saying only
      // "Photo saved" reads as "it is saved", and an assessment tapped
      // out before the photo is then lost on closing the panel.
      if (unsaved) {
        toast.warning(`Photo saved — tap ${recordLabel} to save the rest`, { duration: 6000 });
      } else {
        toast.success('Photo saved');
      }
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
        {/* ── Pests seen: independent of health, on purpose ── */}
        {pests && pests.length > 0 && (
          <div className="space-y-1.5">
            {sectionLabel('Pests seen', pestKeys.length > 0)}
            <div className="flex flex-wrap gap-1.5">
              {(showAllPests ? [...pestPicker.top, ...pestPicker.rest] : pestPicker.top).map(
                (pest) => {
                  const on = pest.key in pestsSeen;
                  return (
                    <button
                      key={pest.key}
                      type="button"
                      onClick={() => togglePest(pest.key)}
                      aria-pressed={on}
                      disabled={busy}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border active:scale-[0.97] disabled:opacity-50 ${
                        on
                          ? 'bg-flag-600 border-flag-600 text-white ring-2 ring-flag-600 ring-offset-1'
                          : 'border-line text-ink bg-paper hover:bg-canopy-50'
                      }`}
                    >
                      {pest.name}
                    </button>
                  );
                }
              )}
              {!showAllPests && pestPicker.rest.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllPests(true)}
                  disabled={busy}
                  className="px-3 py-2 rounded-lg text-sm font-medium border border-dashed border-line text-bark bg-paper hover:bg-canopy-50 active:scale-[0.97] disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <Plus aria-hidden size={14} />
                  {pestPicker.rest.length} more
                </button>
              )}
            </div>

            {/* Severity, only for what was actually ticked. Optional —
                "seen" on its own is a useful record. */}
            {pestKeys.map((key) => (
              <div key={key} className="flex items-center gap-2 pl-0.5">
                <span className="text-[11px] text-bark flex-1 truncate">
                  {pestNames.get(key) ?? key}
                </span>
                {PEST_SEVERITIES.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setPestSeverity(key, level)}
                    aria-pressed={pestsSeen[key] === level}
                    disabled={busy}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium border capitalize disabled:opacity-50 ${
                      pestsSeen[key] === level
                        ? 'bg-flag-600 border-flag-600 text-white'
                        : 'border-line text-bark bg-paper hover:bg-canopy-50'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            ))}

            {!pestsRanked && (
              <p className="text-[11px] text-bark">
                Not ranked — set a region for this orchard and the ones that matter here come
                first.
              </p>
            )}
          </div>
        )}

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

      </div>

      {/*
        Photo above the record button, because a photo saves on its own
        and the record button is the one that saves everything else.
        Bottom of the stack = the thing that finishes the job.
      */}
      <div className="px-4 pb-4 space-y-2">
        <div className="flex gap-2">
          <PhotoButton
            treeId={tree.tree_id}
            onUploaded={savePhoto}
            className={secondaryAction ? 'h-11 px-3.5' : 'h-11 flex-1'}
            label={secondaryAction ? undefined : 'Photo'}
          />
          {secondaryAction?.(busy)}
        </div>

        <Button
          className="w-full h-11"
          onClick={() => void save()}
          disabled={busy || !hasAnything}
        >
          {busy ? 'Saving…' : unsaved ? `${recordLabel} — not saved yet` : recordLabel}
        </Button>
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
