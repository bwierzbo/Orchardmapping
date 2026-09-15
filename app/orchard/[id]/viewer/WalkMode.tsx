'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClientTree, TreeStatus } from '@/lib/types';
import { STATUS_COLORS } from '@/lib/trees-geojson';
import { STATUS_LABEL } from '@/components/StatusBadge';
import { createTreeEvent } from '@/lib/api/trees';
import {
  defaultDirection,
  sampleVarietyRuns,
  walkContext,
  walkPathFrom,
  type Heading,
  type WalkDirection,
} from '@/lib/serpentine';
import { sgToBrix } from '@/lib/sugar';
import {
  bloomStagesFor,
  FRUIT_METRIC_CATALOG,
  type WalkSettings,
} from '@/lib/settings';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PhotoButton from '@/components/PhotoButton';

export type Inspection = 'health' | 'bloom' | 'fruit';

const INSPECTIONS: Array<{ key: Inspection; label: string; hint: string }> = [
  { key: 'health', label: 'Health', hint: 'Healthy / Stressed / Dead' },
  { key: 'bloom', label: 'Bloom', hint: 'Phenology stage' },
  { key: 'fruit', label: 'Fruit', hint: 'Crop load 1–5' },
];

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
  /**
   * The tree currently selected on the map. During setup it is the
   * starting point (tapping another tree changes it); null starts at
   * the top of the orchard.
   */
  startTreeId: string | null;
  /** Route to draw on the map — the preview during setup, the fixed path during the walk; null clears it. */
  onPathPreview: (path: ClientTree[] | null) => void;
  onSetStatus: (treeId: string, status: TreeStatus) => Promise<boolean>;
  /** Pan the map + highlight the current tree. */
  onFocusTree: (tree: ClientTree) => void;
  onExit: () => void;
}

/**
 * Field survey mode. The setup screen picks which inspections to
 * combine (health / bloom / fruit — any mix) with one big button
 * each; per tree, every chosen inspection appears together and the
 * walk auto-advances the moment the last one is answered. Fruit is a
 * plain 1–5 tap in the quick walk; the detailed metrics (Brix/SG,
 * size, …) only appear when "Detailed fruit metrics" is switched on
 * at setup — and even then every metric is optional and never blocks
 * saving. Bloom/fruit walks honor the survey-scope setting (per-tree
 * or first-N-of-each-variety-run); health-only walks every tree.
 *
 * The route starts at the tree selected on the map (tap to change it)
 * and heads the chosen way along that row, then through the rows the
 * chosen way, serpentine. Anything behind the start is picked up on a
 * second leg so the walk still covers the whole orchard.
 */
export default function WalkMode({
  trees,
  settings,
  startTreeId,
  onPathPreview,
  onSetStatus,
  onFocusTree,
  onExit,
}: WalkModeProps) {
  // ---- setup selections ----
  const [chosen, setChosen] = useState<Set<Inspection>>(() => new Set(['health']));
  const [detailedFruit, setDetailedFruit] = useState(false);
  const [started, setStarted] = useState(false);

  // ---- route ----
  // Start tree = the map selection; the direction resets to "the longer
  // way" whenever the start changes, and the user can flip either axis.
  const startTree = useMemo(
    () => (startTreeId ? trees.find((t) => t.tree_id === startTreeId) ?? null : null),
    [trees, startTreeId]
  );
  const context = useMemo(
    () => (startTreeId ? walkContext(trees, startTreeId) : null),
    [trees, startTreeId]
  );
  const [direction, setDirection] = useState<WalkDirection>(() => defaultDirection(context));
  const [directionFor, setDirectionFor] = useState<string | null>(startTreeId);
  if (!started && directionFor !== startTreeId) {
    setDirectionFor(startTreeId);
    setDirection(defaultDirection(context));
  }
  const sampled =
    (chosen.has('bloom') || chosen.has('fruit')) && settings.surveyScope === 'variety_sample';
  const preview = useMemo(() => {
    const { path: full, turnaround } = walkPathFrom(trees, context ? startTreeId : null, direction);
    if (!sampled) return { path: full, turnaround };
    // Sampling drops trees; keep the turnaround pointing at the same spot
    const mainLeg = sampleVarietyRuns(full.slice(0, turnaround), settings.sampleSize);
    const secondLeg = sampleVarietyRuns(full.slice(turnaround), settings.sampleSize);
    return { path: [...mainLeg, ...secondLeg], turnaround: mainLeg.length };
  }, [trees, context, startTreeId, direction, sampled, settings.sampleSize]);

  // Path is fixed at start; edits during the walk don't reshuffle it
  const [route, setRoute] = useState<{ path: ClientTree[]; turnaround: number }>({
    path: [],
    turnaround: 0,
  });
  const path = route.path;

  // Draw the route on the map: the live preview while setting up, then
  // the fixed path for the whole walk.
  const shownPath = started ? path : preview.path;
  useEffect(() => {
    onPathPreview(shownPath.length > 1 ? shownPath : null);
  }, [shownPath, onPathPreview]);
  useEffect(() => () => onPathPreview(null), [onPathPreview]);

  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState(0);
  // Per-tree answers live in a ref so completion checks always see the
  // latest values regardless of React render timing; the useState
  // mirrors exist only to highlight the selected buttons.
  const answersRef = useRef<{
    health: TreeStatus | null;
    healthDetail?: string;
    bloom: string | null;
    fruit: number | null;
  }>({ health: null, healthDetail: undefined, bloom: null, fruit: null });
  const [healthChoice, setHealthChoice] = useState<TreeStatus | null>(null);
  const [healthDetail, setHealthDetail] = useState<string | undefined>(undefined);
  const [stressOpen, setStressOpen] = useState(false);
  const [stressNote, setStressNote] = useState('');
  const [bloomChoice, setBloomChoice] = useState<string | null>(null);
  const [fruitLoad, setFruitLoad] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  // shared note entry
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');

  const current = path[index] ?? null;
  const liveCurrent = useMemo(
    () => (current ? trees.find((t) => t.tree_id === current.tree_id) ?? current : null),
    [trees, current]
  );

  useEffect(() => {
    if (!current) return;
    onFocusTree(current);
    // Arriving at the second leg: the route jumps back past the start
    // tree, so say so rather than letting the map silently pan away.
    if (started && route.turnaround < path.length && index === route.turnaround) {
      toast.info(`Leg 2 — head back to R${current.row_id} P${current.position} and walk the other way`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, started]);

  // ---- setup screen ----
  if (!started) {
    const toggle = (k: Inspection) =>
      setChosen((prev) => {
        const next = new Set(prev);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        return next;
      });
    return (
      <Sheet
        onExit={onExit}
        header={<p className="text-base font-semibold text-ink">What are you inspecting?</p>}
      >
        <div className="grid grid-cols-3 gap-2 px-4 pb-2">
          {INSPECTIONS.map(({ key, label, hint }) => {
            const on = chosen.has(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                aria-pressed={on}
                className={`h-20 rounded-xl font-semibold text-sm shadow-md active:scale-[0.97] flex flex-col items-center justify-center gap-1 border-2 ${
                  on
                    ? 'bg-canopy-600 border-canopy-700 text-white'
                    : 'bg-paper border-line text-ink hover:bg-canopy-50'
                }`}
              >
                <span className="flex items-center gap-1">
                  {on && <Check size={15} aria-hidden />}
                  {label}
                </span>
                <span className={`text-[10px] font-normal ${on ? 'text-white/80' : 'text-bark'}`}>
                  {hint}
                </span>
              </button>
            );
          })}
        </div>
        {chosen.has('fruit') && (
          <button
            onClick={() => setDetailedFruit((v) => !v)}
            aria-pressed={detailedFruit}
            className={`mx-4 mb-2 w-[calc(100%-2rem)] rounded-xl border-2 px-4 py-3 text-left text-sm font-medium active:scale-[0.99] ${
              detailedFruit
                ? 'bg-canopy-600 border-canopy-700 text-white'
                : 'bg-paper border-line text-ink hover:bg-canopy-50'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {detailedFruit && <Check size={15} aria-hidden />}
              Detailed fruit metrics
            </span>
            <span className={`block text-[11px] font-normal mt-0.5 ${detailedFruit ? 'text-white/80' : 'text-bark'}`}>
              Adds the measurements enabled in Settings (Brix/SG, size, …). All optional.
            </span>
          </button>
        )}
        <RouteSetup
          startTree={startTree}
          context={context}
          direction={direction}
          onDirection={setDirection}
          preview={preview}
        />
        <div className="px-4 pb-2">
          <Button
            className="w-full h-12 text-base"
            disabled={chosen.size === 0 || preview.path.length === 0}
            onClick={() => {
              setRoute(preview);
              setIndex(0);
              setStarted(true);
            }}
          >
            Start walk
          </Button>
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
    answersRef.current = { health: null, healthDetail: undefined, bloom: null, fruit: null };
    setHealthChoice(null);
    setHealthDetail(undefined);
    setStressOpen(false);
    setStressNote('');
    setBloomChoice(null);
    setFruitLoad(null);
    setMetrics({});
    setNoteOpen(false);
    setNote('');
  };

  const advance = () => {
    resetEntry();
    if (atEnd) onExit();
    else setIndex((i) => i + 1);
  };

  /** Save every answered inspection for this tree, then advance. */
  const saveAll = async () => {
    if (busy) return;
    const answers = { ...answersRef.current };
    setBusy(true);
    try {
      let saved = 0;
      if (answers.health) {
        const ok = await onSetStatus(current.tree_id, answers.health);
        if (ok && answers.healthDetail) {
          try {
            await createTreeEvent(current.tree_id, {
              event_type: 'observation',
              detail: answers.healthDetail,
            });
          } catch {
            /* status is saved; observation is best-effort */
          }
        }
        if (ok) saved++;
      }
      if (answers.bloom) {
        await createTreeEvent(current.tree_id, {
          event_type: 'bloom',
          detail: answers.bloom,
          changes: { stage: answers.bloom },
        });
        saved++;
      }
      if (answers.fruit !== null) {
        const payload: Record<string, unknown> = { load: answers.fruit };
        for (const m of FRUIT_METRIC_CATALOG) {
          const raw = metrics[m.key];
          if (raw !== undefined && raw !== '' && !Number.isNaN(Number(raw))) {
            const value = Number(raw);
            // Sugar is stored canonically as °Bx; when the user works in
            // SG, keep the entered SG alongside the converted Brix.
            if (m.key === 'brix' && settings.sugarUnit === 'sg') {
              payload.brix = Math.round(sgToBrix(value) * 10) / 10;
              payload.sg = value;
            } else {
              payload[m.key] = value;
            }
          }
        }
        await createTreeEvent(current.tree_id, {
          event_type: 'fruit_check',
          detail: `Load ${answers.fruit}/5`,
          changes: payload,
        });
        saved++;
      }
      if (saved > 0) setRecorded((n) => n + saved);
      advance();
    } catch (err) {
      toast.error(
        err instanceof Error ? `Save failed: ${err.message}` : 'Save failed — try again',
      );
    } finally {
      setBusy(false);
    }
  };

  /** True when every chosen inspection has an answer (reads the ref). */
  const refComplete = () => {
    const a = answersRef.current;
    return (
      (!chosen.has('health') || a.health !== null) &&
      (!chosen.has('bloom') || a.bloom !== null) &&
      (!chosen.has('fruit') || a.fruit !== null)
    );
  };

  /** An inspection answer landed — auto-save when everything chosen is in
   *  (unless detailed fruit metrics are open, which use the button). */
  const maybeComplete = () => {
    if (refComplete() && !detailedFruit) {
      void saveAll();
    }
  };

  const pickHealth = (status: TreeStatus, detail?: string) => {
    answersRef.current.health = status;
    answersRef.current.healthDetail = detail;
    setHealthChoice(status);
    setHealthDetail(detail);
    setStressOpen(false);
    maybeComplete();
  };

  const pickBloom = (stage: string) => {
    answersRef.current.bloom = stage;
    setBloomChoice(stage);
    maybeComplete();
  };

  const pickFruit = (load: number) => {
    answersRef.current.fruit = load;
    setFruitLoad(load);
    maybeComplete();
  };

  const allAnswered =
    (!chosen.has('health') || healthChoice !== null) &&
    (!chosen.has('bloom') || bloomChoice !== null) &&
    (!chosen.has('fruit') || fruitLoad !== null);

  const saveNote = async () => {
    if (!note.trim() || busy) return;
    setBusy(true);
    try {
      await createTreeEvent(current.tree_id, {
        event_type: 'observation',
        detail: note.trim(),
      });
      setRecorded((n) => n + 1);
      setNote('');
      setNoteOpen(false);
    } finally {
      setBusy(false);
    }
  };

  // Photo taken mid-walk: records an observation event carrying the
  // image (with the note text if one is typed). Does not auto-advance —
  // a photo usually precedes a status tap on the same tree.
  const savePhoto = async (url: string) => {
    try {
      await createTreeEvent(current.tree_id, {
        event_type: 'observation',
        detail: note.trim() || undefined,
        photo_url: url,
      });
      setRecorded((n) => n + 1);
      setNote('');
      setNoteOpen(false);
    } catch {
      /* upload succeeded but event failed — photo remains in Blob */
    }
  };

  const enabledMetrics = FRUIT_METRIC_CATALOG.filter((m) =>
    settings.fruitMetrics.includes(m.key)
  );
  const sectionLabel = (label: string, done: boolean) => (
    <p className="text-[11px] font-semibold tracking-wide text-bark uppercase flex items-center gap-1">
      {label}
      {done && <Check size={12} aria-hidden className="text-canopy-600" />}
    </p>
  );

  return (
    <Sheet
      onExit={onExit}
      header={
        <>
          <p className="font-mono text-xs text-bark tracking-wide">
            R{current.row_id} · P{current.position} — {index + 1}/{path.length}
            {route.turnaround < path.length && index >= route.turnaround && ' · leg 2'}
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
      <div className="space-y-3 px-4 pb-2">
        {/* ── Health ── */}
        {chosen.has('health') && !stressOpen && (
          <div className="space-y-1.5">
            {chosen.size > 1 && sectionLabel('Health', healthChoice !== null)}
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
                onClick={() => setStressOpen(true)}
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
          </div>
        )}

        {chosen.has('health') && stressOpen && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-bark">Why stressed?</p>
            <div className="flex flex-wrap gap-1.5">
              {STRESS_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() =>
                    pickHealth('stressed', stressNote.trim() ? `${r}: ${stressNote.trim()}` : r)
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

        {/* ── Bloom ── */}
        {chosen.has('bloom') && !stressOpen && (
          <div className="space-y-1.5">
            {chosen.size > 1 && sectionLabel('Bloom', bloomChoice !== null)}
            <div className="flex flex-wrap gap-1.5">
              {bloomStagesFor(settings).map((stage) => (
                <button
                  key={stage}
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
        {chosen.has('fruit') && !stressOpen && (
          <div className="space-y-2">
            {chosen.size > 1 && sectionLabel('Fruit load', fruitLoad !== null)}
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
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
                        onChange={(e) =>
                          setMetrics((prev) => ({ ...prev, [m.key]: e.target.value }))
                        }
                        className="h-10 mt-0.5"
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Detailed mode saves via the button (metrics never block).
            In quick mode the same button appears only as a failsafe if
            everything is answered but auto-advance didn't fire. */}
        {(detailedFruit || (allAnswered && !busy)) && (
          <Button className="w-full h-11" onClick={() => void saveAll()} disabled={busy || !allAnswered}>
            {busy ? 'Saving…' : 'Record & next'}
          </Button>
        )}
      </div>

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
          <PhotoButton
            treeId={current.tree_id}
            onUploaded={savePhoto}
            className="h-11 px-3.5"
          />
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

/**
 * Setup-screen route picker: where the walk starts (the map selection)
 * and which way it heads along the row and through the rows. Each
 * direction button names the neighbour it leads toward so the choice
 * reads like the orchard, not like a sort order.
 */
function RouteSetup({
  startTree,
  context,
  direction,
  onDirection,
  preview,
}: {
  startTree: ClientTree | null;
  context: ReturnType<typeof walkContext>;
  direction: WalkDirection;
  onDirection: (d: WalkDirection) => void;
  preview: { path: ClientTree[]; turnaround: number };
}) {
  const behind = preview.path.length - preview.turnaround;
  const label = (kind: 'pos' | 'row', heading: Heading) => {
    if (!context) return heading === 1 ? 'Up' : 'Down';
    const next =
      kind === 'pos'
        ? heading === 1 ? context.nextPosUp : context.nextPosDown
        : heading === 1 ? context.nextRowUp : context.nextRowDown;
    if (next === null) return kind === 'pos' ? 'Row end' : 'Orchard edge';
    return kind === 'pos' ? `Toward P${next}` : `Toward R${next}`;
  };
  const count = (kind: 'pos' | 'row', heading: Heading) => {
    if (!context) return null;
    const n =
      kind === 'pos'
        ? heading === 1 ? context.aheadUp : context.aheadDown
        : heading === 1 ? context.rowsUp : context.rowsDown;
    return `${n} ${kind === 'pos' ? 'tree' : 'row'}${n === 1 ? '' : 's'}`;
  };

  const choice = (
    kind: 'pos' | 'row',
    heading: Heading,
    Icon: typeof ArrowUp,
  ) => {
    const on = (kind === 'pos' ? direction.along : direction.rows) === heading;
    const empty =
      context !== null &&
      (kind === 'pos'
        ? heading === 1 ? context.aheadUp : context.aheadDown
        : heading === 1 ? context.rowsUp : context.rowsDown) === 0;
    return (
      <button
        type="button"
        onClick={() =>
          onDirection(kind === 'pos' ? { ...direction, along: heading } : { ...direction, rows: heading })
        }
        aria-pressed={on}
        disabled={empty && !on}
        className={`h-12 rounded-xl border-2 px-2 text-sm font-medium active:scale-[0.97] flex items-center justify-center gap-1.5 disabled:opacity-40 ${
          on
            ? 'bg-canopy-600 border-canopy-700 text-white'
            : 'bg-paper border-line text-ink hover:bg-canopy-50'
        }`}
      >
        <Icon size={15} aria-hidden />
        <span className="truncate">{label(kind, heading)}</span>
        {count(kind, heading) && (
          <span className={`text-[10px] font-normal ${on ? 'text-white/80' : 'text-bark'}`}>
            {count(kind, heading)}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="px-4 pb-3 space-y-2">
      <div className="rounded-xl border border-line bg-paper px-3 py-2">
        <p className="text-[11px] font-semibold tracking-wide text-bark uppercase">Start from</p>
        {startTree && context ? (
          <p className="text-sm text-ink">
            <span className="font-mono">R{context.row} · P{context.position}</span>
            {startTree.variety ? ` — ${startTree.variety}` : ''}
            <span className="block text-[11px] text-bark">Tap another tree on the map to change.</span>
          </p>
        ) : (
          <p className="text-sm text-ink">
            First tree of the orchard
            <span className="block text-[11px] text-bark">
              {startTree
                ? 'The selected tree has no row/position, so it can’t anchor a route.'
                : 'Tap a tree on the map to start there instead.'}
            </span>
          </p>
        )}
      </div>
      {context && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {choice('pos', -1, ArrowLeft)}
            {choice('pos', 1, ArrowRight)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {choice('row', -1, ArrowDown)}
            {choice('row', 1, ArrowUp)}
          </div>
        </>
      )}
      <p className="text-[11px] text-bark">
        {preview.path.length === 0
          ? 'No trees with a row and position to walk.'
          : behind > 0
            ? `${preview.path.length} trees. ${behind} behind your start are covered on a second leg back from R${context?.row} P${context?.position}.`
            : `${preview.path.length} trees, one pass.`}
      </p>
    </div>
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
  children: React.ReactNode;
}) {
  return (
    <button
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
