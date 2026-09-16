'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientTree, TreeStatus } from '@/lib/types';
import { STATUS_LABEL } from '@/components/StatusBadge';
import { deleteWalkProgress, fetchWalkProgress, putWalkProgress } from '@/lib/api/walk-progress';
import {
  defaultDirection,
  sampleVarietyRuns,
  walkContext,
  walkPathFrom,
  type Heading,
  type WalkDirection,
} from '@/lib/serpentine';
import {
  clearLocalWalkProgress,
  loadLocalWalkProgress,
  newerWalkProgress,
  nextUnassessed,
  resumeRoute,
  saveLocalWalkProgress,
  type WalkInspection,
  type WalkProgress,
} from '@/lib/walk-progress';
import type { WalkSettings } from '@/lib/settings';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import InspectionEntry from './InspectionEntry';

export type Inspection = WalkInspection;

const INSPECTIONS: Array<{ key: Inspection; label: string; hint: string }> = [
  { key: 'health', label: 'Health', hint: 'Healthy / Stressed / Dead' },
  { key: 'bloom', label: 'Bloom', hint: 'Phenology stage' },
  { key: 'fruit', label: 'Fruit', hint: 'Crop load 1–5' },
];
const INSPECTION_LABEL: Record<Inspection, string> = {
  health: 'Health',
  bloom: 'Bloom',
  fruit: 'Fruit',
};

/** Server mirror of the progress waits this long after the last step. */
const SYNC_DELAY_MS = 1500;

export interface WalkProgressView {
  done: ReadonlySet<string>;
  todo: ReadonlySet<string>;
}

interface WalkModeProps {
  orchardId: string;
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
  /** Which trees are assessed / still to visit, for the map to style; null clears it. */
  onProgress: (progress: WalkProgressView | null) => void;
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
 *
 * Progress is saved after every tree (locally at once, to the server a
 * moment later), so closing the sheet pauses the walk and "Walk Survey"
 * offers to resume it — on this device or another — with the assessed
 * and remaining trees marked on the map.
 *
 * A notes field is always on screen. Notes ride along with whatever is
 * recorded for the tree; a stressed tree also takes a highlighted key
 * issue, and stressed never auto-advances so there is room to type.
 */
export default function WalkMode({
  orchardId,
  trees,
  settings,
  startTreeId,
  onPathPreview,
  onProgress,
  onSetStatus,
  onFocusTree,
  onExit,
}: WalkModeProps) {
  // ---- setup selections ----
  const [chosen, setChosen] = useState<Set<Inspection>>(() => new Set(['health']));
  const [detailedFruit, setDetailedFruit] = useState(false);
  const [started, setStarted] = useState(false);

  // ---- a paused walk to resume? ----
  // Local copy first (instant, works offline), then the server copy if
  // it is newer. Once the user resumes or starts over, a late server
  // reply must not resurrect the card.
  const [saved, setSaved] = useState<WalkProgress | null>(() => loadLocalWalkProgress(orchardId));
  const savedSettledRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    fetchWalkProgress(orchardId)
      .then((remote) => {
        if (cancelled || savedSettledRef.current || !remote) return;
        setSaved((prev) => newerWalkProgress(prev, remote));
      })
      .catch(() => {}); // local copy is enough
    return () => {
      cancelled = true;
    };
  }, [orchardId]);
  const resumable = useMemo(() => (saved ? resumeRoute(saved, trees) : null), [saved, trees]);

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

  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState(0);
  /** Trees with at least one inspection recorded on this walk. */
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const startedAtRef = useRef<string>('');

  // Draw the route on the map: the paused walk while its card shows,
  // the live preview while setting up, then the fixed path for the walk.
  const shownPath = started ? path : resumable ? resumable.path : preview.path;
  useEffect(() => {
    onPathPreview(shownPath.length > 1 ? shownPath : null);
  }, [shownPath, onPathPreview]);
  useEffect(() => () => onPathPreview(null), [onPathPreview]);

  // Assessed / remaining trees for the map styling
  useEffect(() => {
    if (started) {
      onProgress({
        done,
        todo: new Set(path.filter((t) => !done.has(t.tree_id)).map((t) => t.tree_id)),
      });
    } else if (resumable) {
      onProgress({
        done: resumable.done,
        todo: new Set(
          resumable.path.filter((t) => !resumable.done.has(t.tree_id)).map((t) => t.tree_id)
        ),
      });
    } else {
      onProgress(null);
    }
  }, [started, path, done, resumable, onProgress]);
  useEffect(() => () => onProgress(null), [onProgress]);

  // ---- progress persistence ----
  const current = path[index] ?? null;
  const finishedRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotRef = useRef<WalkProgress | null>(null);
  const flushSync = useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    const snap = snapshotRef.current;
    snapshotRef.current = null; // sent once; the next step sets a fresh one
    if (snap) putWalkProgress(snap).catch(() => {}); // local copy already saved
  }, []);
  useEffect(() => {
    if (!started || finishedRef.current) return;
    const snap: WalkProgress = {
      version: 1,
      orchardId,
      inspections: [...chosen],
      detailedFruit,
      pathIds: path.map((t) => t.tree_id),
      turnaround: route.turnaround,
      currentId: current?.tree_id ?? null,
      doneIds: [...done],
      recorded,
      startedAt: startedAtRef.current,
      updatedAt: new Date().toISOString(),
    };
    snapshotRef.current = snap;
    saveLocalWalkProgress(snap);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(flushSync, SYNC_DELAY_MS);
    // chosen/detailedFruit are fixed once started; only steps re-save
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, index, done, recorded]);
  // Unmount mid-walk (navigation, unload) still lands the last step
  useEffect(() => () => flushSync(), [flushSync]);

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

  // ---- start / resume / finish ----
  const startNew = () => {
    savedSettledRef.current = true;
    startedAtRef.current = new Date().toISOString();
    setRoute(preview);
    setDone(new Set());
    setRecorded(0);
    setIndex(0);
    setStarted(true);
  };

  const resume = () => {
    if (!saved || !resumable) return;
    savedSettledRef.current = true;
    startedAtRef.current = saved.startedAt;
    setChosen(new Set(saved.inspections));
    setDetailedFruit(saved.detailedFruit);
    setRoute({ path: resumable.path, turnaround: resumable.turnaround });
    setDone(new Set(resumable.done));
    setRecorded(saved.recorded);
    setIndex(resumable.index);
    setStarted(true);
  };

  const discardSaved = () => {
    savedSettledRef.current = true;
    clearLocalWalkProgress(orchardId);
    deleteWalkProgress(orchardId).catch(() => {});
    setSaved(null);
  };

  /** Close the sheet mid-walk: progress is already saved; push the server copy now. */
  const pause = () => {
    flushSync();
    if (started && !finishedRef.current) {
      toast.info('Walk paused — open Walk Survey to pick it up again');
    }
    onExit();
  };

  const finish = () => {
    finishedRef.current = true;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    snapshotRef.current = null;
    clearLocalWalkProgress(orchardId);
    deleteWalkProgress(orchardId).catch(() => {});
    const skipped = path.length - done.size;
    toast.success(
      skipped > 0
        ? `Walk complete — ${done.size} of ${path.length} assessed, ${skipped} skipped`
        : `Walk complete — all ${path.length} trees assessed`
    );
    onExit();
  };

  // ---- setup screen ----
  if (!started) {
    const toggle = (k: Inspection) =>
      setChosen((prev) => {
        const next = new Set(prev);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        return next;
      });

    if (saved && resumable) {
      const nextUp = resumable.path[resumable.index];
      const remaining = resumable.path.length - resumable.done.size;
      return (
        <Sheet
          onExit={onExit}
          header={<p className="text-base font-semibold text-ink">Walk in progress</p>}
        >
          <div className="px-4 pb-4 space-y-3">
            <div className="rounded-xl border border-line bg-paper px-3 py-2.5 space-y-1">
              <p className="text-sm font-medium text-ink">
                {saved.inspections.map((i) => INSPECTION_LABEL[i]).join(' + ')}
                {saved.detailedFruit ? ' (detailed)' : ''}
              </p>
              <p className="text-sm text-ink">
                <span className="font-semibold">{resumable.done.size}</span> of{' '}
                {resumable.path.length} assessed ·{' '}
                <span className="font-semibold">{remaining}</span> remaining
              </p>
              <p className="text-[11px] text-bark">
                Paused {relativeTime(saved.updatedAt)} · next up{' '}
                <span className="font-mono">
                  R{nextUp.row_id} · P{nextUp.position}
                </span>
              </p>
              <p className="text-[11px] text-bark">
                On the map, assessed trees are faded and remaining ones ringed.
              </p>
            </div>
            <Button className="w-full h-12 text-base" onClick={resume}>
              Resume walk
            </Button>
            <Button variant="secondary" className="w-full h-11" onClick={discardSaved}>
              Start over
            </Button>
          </div>
        </Sheet>
      );
    }

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
            onClick={startNew}
          >
            Start walk
          </Button>
        </div>
        <p className="px-4 pb-4 text-xs text-bark">
          Health visits every tree.{' '}
          {settings.surveyScope === 'variety_sample'
            ? `Bloom & fruit sample the first ${settings.sampleSize} of each variety run (change in Settings).`
            : 'Bloom & fruit also visit every tree (change in Settings).'}{' '}
          You can close the walk at any point and resume later.
        </p>
      </Sheet>
    );
  }

  if (!current || path.length === 0) return null;

  const atEnd = index >= path.length - 1;

  // Next tree still to visit — trees assessed meanwhile (from the map's
  // Inspect button while the walk was paused) are passed over.
  const advance = () => {
    if (atEnd) {
      finish();
      return;
    }
    const next = nextUnassessed(path, done, index + 1);
    if (next < 0) {
      // Everything ahead is assessed: land on the last tree so Finish shows
      const skipped = path.length - 1 - index;
      if (skipped > 1) toast.info(`Skipped ${skipped - 1} trees already assessed`);
      setIndex(path.length - 1);
      return;
    }
    const skipped = next - index - 1;
    if (skipped > 0) {
      toast.info(`Skipped ${skipped} ${skipped === 1 ? 'tree' : 'trees'} already assessed`);
    }
    setIndex(next);
  };

  return (
    <Sheet
      onExit={pause}
      exitLabel="Pause walk"
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
            now: {STATUS_LABEL[liveCurrent?.status ?? current.status]} · assessed {done.size}/
            {path.length}
            {done.has(current.tree_id) && ' · this tree done'}
          </p>
        </>
      }
      onBack={index > 0 && !busy ? () => setIndex((i) => i - 1) : undefined}
    >
      {/* The same form the tree panel's "Inspect" opens — one code path,
          one set of events. Keyed per tree so entries never carry over. */}
      <InspectionEntry
        key={current.tree_id}
        tree={current}
        settings={settings}
        inspections={chosen}
        detailedFruit={detailedFruit}
        autoSave
        recordLabel="Record & next"
        onSetStatus={onSetStatus}
        onBusyChange={setBusy}
        onSaved={({ saved, inspected, photo }) => {
          if (saved > 0) setRecorded((n) => n + saved);
          if (inspected) setDone((prev) => new Set(prev).add(current.tree_id));
          // A photo alone stays on the tree — a status tap usually follows
          if (!photo) advance();
        }}
        secondaryAction={(entryBusy) => (
          <Button
            variant="secondary"
            className="h-11 flex-1"
            onClick={advance}
            disabled={entryBusy}
          >
            {atEnd ? 'Finish walk' : 'Skip'} <ChevronRight size={16} aria-hidden />
          </Button>
        )}
      />
    </Sheet>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return 'just now';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

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

function Sheet({
  header,
  onExit,
  exitLabel = 'Exit walk mode',
  onBack,
  children,
}: {
  header: React.ReactNode;
  onExit: () => void;
  exitLabel?: string;
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
          aria-label={exitLabel}
          title={exitLabel}
          className="p-2 -m-1 rounded-lg text-bark hover:text-ink hover:bg-canopy-50"
        >
          <X size={20} aria-hidden />
        </button>
      </div>
      {children}
    </div>
  );
}
