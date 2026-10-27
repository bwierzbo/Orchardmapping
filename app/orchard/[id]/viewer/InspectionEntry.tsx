'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ClientTree, TreeStatus } from '@/lib/types';
import { STATUS_COLORS } from '@/lib/trees-geojson';
import { createTreeEvent, recordTreeHarvest, setTreeHarvestComplete } from '@/lib/api/trees';
import { sgToBrix } from '@/lib/sugar';
import { bloomStagesFor, FRUIT_METRIC_CATALOG, type WalkSettings } from '@/lib/settings';
import type { WalkInspection } from '@/lib/walk-progress';
import { Check, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PhotoButton from '@/components/PhotoButton';
import { trpc } from '@/lib/trpc/client';
import { splitForPicker, type PickablePest } from '@/lib/pest-picker';
import { METRIC_HELP, inchesToMm } from '@/lib/fruit-metrics';
import { previousReading, readingDelta } from '@/lib/previous-reading';
import {
  describeHarvest,
  HARVEST_UNITS,
  toPounds,
  type HarvestUnit,
} from '@/lib/harvest-units';
import { isHarvestComplete, type HarvestSeason } from '@/lib/tree-harvest-season';
import {
  sameVariety,
  treeVarieties,
  varietyCompletions,
  type ClientGraft,
} from '@/lib/grafts';
import { dateToYMD, formatYMD } from '@/lib/dates';
import type { LastObservation } from '@/lib/db/last-observation';
import { CONDITION_METRIC_CATALOG } from '@/lib/settings';
import {
  READINESS_VERDICTS,
  READINESS_LABEL,
  describePrediction,
  type ReadinessVerdict,
} from '@/lib/harvest-readiness';
import FieldHelp from './FieldHelp';

/**
 * Causes the pest library cannot hold.
 *
 * "Pests" and "Disease" used to be in this list, which is what made the
 * form ask the same question twice: once as a reason for stress, then again
 * as a thing seen, with the actual pest behind that. They are gone. What is
 * left is the handful of causes that are not pests at all, and they appear
 * in the SAME list as the pests -- what you saw is one question.
 */
export const OTHER_CAUSES = ['Deer / vole', 'Drought', 'Broken / leaning', 'Other'];

export type PestSeverity = 'light' | 'moderate' | 'severe';
export const PEST_SEVERITIES: readonly PestSeverity[] = ['light', 'moderate', 'severe'];

export interface InspectionAnswers {
  health: TreeStatus | null;
  /** Causes picked from OTHER_CAUSES, which are not pests. */
  causes: string[];
  /** Trunk and scaffold counts, by CONDITION_METRIC_CATALOG key. */
  condition: Record<string, string>;
  /**
   * "When would you pick this?", by variety: one answer on a one-variety
   * tree, one per variety on a grafted one, since a Chehalis limb ripens
   * on its own clock.
   */
  readiness: Record<string, ReadinessVerdict>;
  /** What the model predicted for each variety when asked, ISO date. */
  predictedCentre: Record<string, string | null>;
  /**
   * What came off the tree on this visit, one line per variety picked: a
   * grafted tree can give a Gala line and a Chehalis line. Amounts are
   * kept as typed; a blank line means nothing was picked.
   */
  harvest: HarvestLine[];
  /**
   * The tree picked out for the season (true), opened again (false), or
   * left as it is (null). A pending answer like the rest, so the last pick
   * and "that's the lot" go in with one Record.
   */
  harvestComplete: boolean | null;
  /**
   * On a grafted tree, which is picked out one variety at a time: each
   * variety closed (true) or opened again (false). Empty otherwise.
   */
  varietyComplete: Record<string, boolean>;
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
  /**
   * How the measurements above were typed. Readings are stored
   * canonically — millimetres and °Bx — but what somebody actually read
   * off their instrument is kept beside it, because a converted number
   * rounded back is not the number they wrote down.
   */
  units: { sugar: 'brix' | 'sg'; size: 'mm' | 'in' };
  note: string;
}

/** One weighed amount off a tree. */
export interface HarvestLine {
  /** Stable across edits, for React and for removing the right line. */
  key: number;
  /** Which variety on a grafted tree; null on a one-variety tree. */
  variety: string | null;
  quantity: string;
  unit: HarvestUnit;
  /**
   * Already recorded. Set as each line lands, so a Record retried after a
   * later line failed never records the earlier ones twice.
   */
  saved?: boolean;
}

export interface InspectionSaved {
  /** Inspections + observations written (the walk's "recorded" counter). */
  saved: number;
  /** At least one of health / bloom / fruit was recorded (the tree counts as assessed). */
  inspected: boolean;
  /** True when this was a photo, not the record button (a walk stays on the tree). */
  photo: boolean;
  /**
   * The tree record itself changed: a pick moves last_harvest, closing or
   * reopening the season sets harvest_completed_on. A caller holding the
   * tree list reloads it so the map's harvest badge follows.
   */
  treeChanged: boolean;
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
 *  - harvest → a harvests row for what came off today, then the season
 *    marked complete or reopened if that was asked for;
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
  // The grower's day, not the server's: a pick at 6pm in October is not
  // tomorrow's, and the season total and "complete" both go by this date.
  const today = dateToYMD(new Date());
  let saved = 0;
  let noteUsed = false;
  if (answers.health) {
    const ok = await onSetStatus(tree.tree_id, answers.health);
    if (ok) {
      saved++;
      const reason = answers.causes.length > 0 ? answers.causes.join(', ') : null;
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
        if (m.key === 'brix' && answers.units.sugar === 'sg') {
          payload.brix = Math.round(sgToBrix(value) * 10) / 10;
          payload.sg = value;
        } else if (m.key === 'size_mm' && answers.units.size === 'in') {
          payload.size_mm = Math.round(inchesToMm(value) * 10) / 10;
          payload.size_in = value;
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
  // Trunk counts: their own event, because a canker is not a fruit
  // characteristic and the anthracnose programme reads it on its own.
  const conditionPayload: Record<string, number> = {};
  for (const m of CONDITION_METRIC_CATALOG) {
    const raw = answers.condition[m.key];
    if (raw !== undefined && raw !== '' && !Number.isNaN(Number(raw))) {
      conditionPayload[m.key] = Number(raw);
    }
  }
  if (Object.keys(conditionPayload).length > 0) {
    const cankers = conditionPayload.canker_count;
    await createTreeEvent(tree.tree_id, {
      event_type: 'tree_condition',
      detail:
        cankers === undefined
          ? 'Trunk checked'
          : `${cankers} canker${cankers === 1 ? '' : 's'} on trunk and scaffolds`,
      changes: conditionPayload,
    });
    saved++;
  }

  // The verdict, with what the model said ON THE DAY. Stored together so a
  // later comparison judges the prediction that was actually made, not one
  // recomputed after the interval has been corrected.
  const verdicts = Object.entries(answers.readiness);
  for (const [variety, verdict] of verdicts) {
    await createTreeEvent(tree.tree_id, {
      event_type: 'harvest_readiness',
      // Named only on a tree with a choice of varieties.
      detail:
        verdicts.length > 1 || !sameVariety(variety, tree.variety)
          ? `${variety}: ${READINESS_LABEL[verdict]}`
          : READINESS_LABEL[verdict],
      changes: {
        verdict,
        predicted_centre: answers.predictedCentre[variety] ?? null,
        variety,
      },
    });
    saved++;
  }

  // Recorded with everything else rather than from a button of its own:
  // two save buttons on one form was one too many to remember to press.
  // Not tied to the picking verdict -- a tree with no variety is never
  // asked for one, and its fruit still comes off.
  let harvested = false;
  for (const line of answers.harvest) {
    if (line.saved) {
      harvested = true;
      continue;
    }
    const qty = Number(line.quantity);
    if (line.quantity.trim() === '' || toPounds(qty, line.unit, tree.fruit_type) === null) continue;
    await recordTreeHarvest(tree.tree_id, {
      quantity: qty,
      unit: line.unit,
      harvest_date: today,
      ...(line.variety ? { variety: line.variety } : {}),
    });
    line.saved = true;
    harvested = true;
    saved++;
  }
  // After the pick, so "the last 20 lb, and that's the lot" lands in that
  // order in the tree's history.
  if (answers.harvestComplete !== null) {
    await setTreeHarvestComplete(tree.tree_id, {
      complete: answers.harvestComplete,
      date: today,
    });
    saved++;
  }
  for (const [variety, complete] of Object.entries(answers.varietyComplete)) {
    await setTreeHarvestComplete(tree.tree_id, { complete, date: today, variety });
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
      harvested ||
      pestKeys.length > 0,
    photo: false,
    treeChanged:
      harvested ||
      answers.harvestComplete !== null ||
      Object.keys(answers.varietyComplete).length > 0,
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
  /**
   * Bloom stages hidden behind a Bloom button until asked for. The tree
   * panel offers every section on every visit, and for most of the year a
   * row of bloom stages is a row to scroll past. A walk that chose bloom
   * shows it open, because there it is the question.
   */
  bloomOnRequest?: boolean;
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
  bloomOnRequest = false,
  secondaryAction,
  pests,
  pestSightings,
  pestsRanked = true,
}: InspectionEntryProps) {
  // Answers live in a ref so the auto-save check sees the latest values
  // regardless of render timing; the state mirrors drive the highlights.
  const answersRef = useRef<InspectionAnswers>({
    health: null,
    causes: [],
    condition: {},
    readiness: {},
    predictedCentre: {},
    harvest: [{ key: 0, variety: null, quantity: '', unit: 'lb' }],
    harvestComplete: null,
    varietyComplete: {},
    bloom: null,
    fruit: null,
    metrics: {},
    pests: {},
    units: { sugar: settings.sugarUnit, size: 'mm' },
    note: '',
  });
  const [healthChoice, setHealthChoice] = useState<TreeStatus | null>(null);
  const [causes, setCauses] = useState<string[]>([]);
  const [bloomChoice, setBloomChoice] = useState<string | null>(null);
  const [fruitLoad, setFruitLoad] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<Record<string, string>>({});
  const [condition, setConditionState] = useState<Record<string, string>>({});
  const [readiness, setReadiness] = useState<Record<string, ReadinessVerdict>>({});
  /** Photos taken on this tree in this sitting, newest last. */
  const [photos, setPhotos] = useState<string[]>([]);
  /**
   * The varieties grafted onto this tree. A tree with more than one variety
   * is picked by variety: each weighed line says which, and each variety is
   * picked out on its own. A one-variety tree's form is unchanged.
   */
  const [grafts, setGrafts] = useState<ClientGraft[]>([]);
  const varieties = useMemo(() => treeVarieties(tree.variety, grafts), [tree.variety, grafts]);
  const multiVariety = varieties.length > 1;
  /** Pounds unless the picker says otherwise; one line until a second variety is added. */
  const [harvestLines, setHarvestLinesState] = useState<HarvestLine[]>(() => [
    { key: 0, variety: null, quantity: '', unit: 'lb' },
  ]);
  const nextLineKey = useRef(1);
  const setHarvestLines = (lines: HarvestLine[]) => {
    answersRef.current.harvest = lines;
    setHarvestLinesState(lines);
  };
  useEffect(() => {
    let live = true;
    trpc.graft.list
      .query({ treeId: tree.tree_id })
      .then((list) => {
        if (!live) return;
        setGrafts(list);
        // A grafted tree's first line starts on the tree's own variety
        const names = treeVarieties(tree.variety, list);
        if (names.length > 1) {
          const lines = answersRef.current.harvest.map((l) =>
            l.variety === null ? { ...l, variety: names[0] } : l
          );
          answersRef.current.harvest = lines;
          setHarvestLinesState(lines);
        }
      })
      .catch(() => {
        // Without the list the tree is picked as one variety, as before.
      });
    return () => {
      live = false;
    };
  }, [tree.tree_id, tree.variety]);
  const updateLine = (key: number, patch: Partial<HarvestLine>) =>
    setHarvestLines(harvestLines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  /** Another line, on a variety not yet weighed here if there is one. */
  const addLine = () => {
    const used = new Set(harvestLines.map((l) => (l.variety ?? '').toLowerCase()));
    const variety = varieties.find((v) => !used.has(v.toLowerCase())) ?? varieties[0] ?? null;
    const unit = harvestLines[harvestLines.length - 1]?.unit ?? 'lb';
    setHarvestLines([...harvestLines, { key: nextLineKey.current++, variety, quantity: '', unit }]);
  };
  const removeLine = (key: number) => setHarvestLines(harvestLines.filter((l) => l.key !== key));
  const linePounds = (l: HarvestLine) => toPounds(Number(l.quantity), l.unit, tree.fruit_type);
  /** Something weighed and usable on any line. */
  const anyHarvest = harvestLines.some((l) => linePounds(l) !== null);
  const anyHarvestTyped = harvestLines.some((l) => l.quantity !== '');
  const [harvestCompleteChoice, setHarvestCompleteChoice] = useState<boolean | null>(null);
  /** Pending per-variety picked-out changes on a grafted tree. */
  const [varietyChoice, setVarietyChoiceState] = useState<Record<string, boolean>>({});
  const completions = useMemo(
    () => varietyCompletions(tree.variety, tree.main_harvest_completed_on ?? null, grafts),
    [tree.variety, tree.main_harvest_completed_on, grafts]
  );
  /**
   * What this tree has given so far this season. The season is the
   * grower's calendar year, so the year is worked out here, not on a
   * server running in UTC.
   */
  const [season, setSeason] = useState<HarvestSeason | null>(null);
  const seasonYear = new Date().getFullYear();
  useEffect(() => {
    let live = true;
    trpc.tree.harvestSeason
      .query({ treeId: tree.tree_id, year: seasonYear })
      .then((v) => {
        if (live) setSeason(v);
      })
      .catch(() => {
        // Context, not a gate: a pick can be recorded without the total.
      });
    return () => {
      live = false;
    };
  }, [tree.tree_id, seasonYear]);
  // Until the season loads, the tree record says whether it was closed.
  const savedComplete =
    season?.complete ?? isHarvestComplete(tree.harvest_completed_on, seasonYear);
  const shownComplete = harvestCompleteChoice ?? savedComplete;
  /**
   * The first tap asks for the opposite of what is saved; a second takes
   * the request back, so a mis-tap never needs a reopen to undo it.
   */
  const toggleHarvestComplete = () => {
    const next = harvestCompleteChoice === null ? !savedComplete : null;
    answersRef.current.harvestComplete = next;
    setHarvestCompleteChoice(next);
  };
  const varietySavedComplete = (variety: string) =>
    isHarvestComplete(
      completions.find((c) => sameVariety(c.variety, variety))?.completedOn ?? null,
      seasonYear
    );
  /** Same two-tap rule as the whole-tree button, one variety at a time. */
  const toggleVarietyComplete = (variety: string) => {
    const next = { ...varietyChoice };
    if (variety in next) delete next[variety];
    else next[variety] = !varietySavedComplete(variety);
    answersRef.current.varietyComplete = next;
    setVarietyChoiceState(next);
  };
  const varietyChoicePending = Object.keys(varietyChoice).length > 0;
  const [bloomOpen, setBloomOpen] = useState(!bloomOnRequest);

  /**
   * What this tree showed last time. Shown beside the empty fields, never
   * written into them -- a stale starch index dated today would poison the
   * harvest prediction that reads the trajectory.
   */
  const [previous, setPrevious] = useState<LastObservation | null>(null);
  const [fetchedCentres, setFetchedCentres] = useState<Record<string, string | null>>({});
  /** Asked of each variety on the tree; a tree with none recorded is not asked. */
  const askReadiness = settings.askHarvestReadiness && varieties.length > 0;

  // What the model expects for each variety, shown beside its verdict so
  // the two can be compared later.
  useEffect(() => {
    if (!settings.askHarvestReadiness || varieties.length === 0) return;
    let live = true;
    for (const variety of varieties) {
      trpc.tree.predictedPick
        // No purpose passed: the orchard's own setting decides it server-side,
        // so a cidery and a fresh-fruit orchard each get their own target.
        .query({ orchardId: tree.orchard_id, variety })
        .then((v) => {
          if (!live) return;
          const centre = v?.centre ?? null;
          setFetchedCentres((prev) => ({ ...prev, [variety]: centre }));
          answersRef.current.predictedCentre = {
            ...answersRef.current.predictedCentre,
            [variety]: centre,
          };
        })
        .catch(() => {
          // A prediction that will not load leaves the verdict unanchored,
          // which readinessDelta already handles by returning null.
        });
    }
    return () => {
      live = false;
    };
  }, [tree.orchard_id, varieties, settings.askHarvestReadiness]);
  useEffect(() => {
    let live = true;
    trpc.tree.lastObservation
      .query({ orchardId: tree.orchard_id, treeId: tree.tree_id })
      .then((v) => {
        if (live) setPrevious(v);
      })
      .catch(() => {
        // Context, not a gate: a tree whose history will not load is still
        // a tree you can inspect.
      });
    return () => {
      live = false;
    };
  }, [tree.orchard_id, tree.tree_id]);
  const [pestsSeen, setPestsSeen] = useState<Record<string, PestSeverity | null>>({});
  const [showAllPests, setShowAllPests] = useState(false);
  /**
   * Whether anything was seen at all, asked before which.
   *
   * Most trees on most walks have nothing on them, and a list of fifteen
   * pests is a wall to scroll past to say so. null = not yet answered,
   * which is also what keeps the walk from auto-advancing before the
   * question has been put.
   */
  const [anyPests, setAnyPests] = useState<boolean | null>(null);
  const anyPestsRef = useRef<boolean | null>(null);
  /** The pest question is only asked where there is a library to ask from. */
  const showPests = !!pests && pests.length > 0;

  const answerAnyPests = (seen: boolean) => {
    anyPestsRef.current = seen;
    setAnyPests(seen);
    if (!seen) {
      // Clearing on "no" keeps the record honest: a pest ticked and then
      // taken back must not be saved.
      answersRef.current.pests = {};
      setPestsSeen({});
    }
    maybeAutoSave();
  };
  /**
   * Units chosen per entry rather than in Settings: somebody with a
   * caliper marked in inches and a refractometer reading Brix should
   * not have to leave the tree to say so. Stored canonically either way
   * — millimetres and °Bx — with what was typed kept alongside.
   */

  const [sugarUnit, setSugarUnitState] = useState<'brix' | 'sg'>(settings.sugarUnit);
  const [sizeUnitValue, setSizeUnitValue] = useState<'mm' | 'in'>('mm');
  const sizeUnit = sizeUnitValue;
  const setSizeUnit = (u: 'mm' | 'in') => {
    answersRef.current.units = { ...answersRef.current.units, size: u };
    setSizeUnitValue(u);
  };
  const setSugarUnit = (u: 'brix' | 'sg') => {
    answersRef.current.units = { ...answersRef.current.units, sugar: u };
    setSugarUnitState(u);
  };

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
      (!inspections.has('fruit') || a.fruit !== null) &&
      // "Nothing seen" is an answer and a useful one — a walk that
      // auto-advanced before the question was put would record silence
      // as if it were a clean tree.
      (!showPests || anyPestsRef.current === false)
    );
  };
  const maybeAutoSave = () => {
    if (
      autoSave &&
      complete() &&
      !detailedFruit &&
      answersRef.current.health !== 'stressed'
    ) {
      void save();
    }
  };

  const pickHealth = (status: TreeStatus) => {
    answersRef.current.health = status;
    setHealthChoice(status);
    maybeAutoSave();
  };

  /**
   * A cause is independent of health, as a pest is: a tree in good shape
   * can still have deer browse on it, and that is worth the record.
   */
  const toggleCause = (cause: string) => {
    const next = causes.includes(cause) ? causes.filter((c) => c !== cause) : [...causes, cause];
    answersRef.current.causes = next;
    setCauses(next);
    // Anything ticked is an answer to "what did you see".
    if (next.length > 0) {
      anyPestsRef.current = true;
      setAnyPests(true);
    }
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
  const setCondition = (key: string, value: string) => {
    answersRef.current.condition = { ...answersRef.current.condition, [key]: value };
    setConditionState(answersRef.current.condition);
  };

  /** A second tap on the same verdict takes it back. */
  const pickReadiness = (variety: string, verdict: ReadinessVerdict) => {
    const next = { ...answersRef.current.readiness };
    if (next[variety] === verdict) delete next[variety];
    else next[variety] = verdict;
    answersRef.current.readiness = next;
    setReadiness(next);
  };
  const anyReadiness = Object.keys(readiness).length > 0;

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
    causes.length > 0 ||
    anyReadiness ||
    anyHarvestTyped ||
    harvestCompleteChoice !== null ||
    varietyChoicePending ||
    Object.values(condition).some((v) => v !== '') ||
    note.trim() !== '';

  // Answers entered and not yet recorded. A photo saves on its own, so
  // this is what would be lost by walking away after taking one.
  const unsaved =
    healthChoice !== null || bloomChoice !== null || fruitLoad !== null ||
    pestKeys.length > 0 ||
    causes.length > 0 ||
    anyReadiness ||
    anyHarvestTyped ||
    harvestCompleteChoice !== null ||
    varietyChoicePending ||
    Object.values(metrics).some((v) => v !== '') ||
    Object.values(condition).some((v) => v !== '');

  useEffect(() => {
    onDirtyChange?.(unsaved);
  }, [unsaved, onDirtyChange]);
  // Leaving the form should not report a dirty state nobody can act on
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Photo: an observation carrying the image (and the note, if typed).
  // Never auto-advances — a photo usually precedes a status tap.
  const savePhoto = async (url: string) => {
    try {
      // Kept so the button can show a thumbnail afterwards: a photo saves
      // on its own and gave no sign it had, so people took a second.
      setPhotos((prev) => [...prev, url]);
      await createTreeEvent(tree.tree_id, {
        event_type: 'observation',
        detail: note.trim() || undefined,
        photo_url: url,
      });
      changeNote('');
      onSaved({ saved: 1, inspected: false, photo: true, treeChanged: false });
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
  const todayIso = dateToYMD(new Date());
  const enabledCondition = CONDITION_METRIC_CATALOG.filter((m) =>
    settings.conditionMetrics.includes(m.key),
  );
  const showLabels = inspections.size > 1;
  const sectionLabel = (label: string, done: boolean, help?: { summary: string; scale?: string }) => (
    <p className="text-[11px] font-semibold tracking-wide text-bark uppercase flex items-center gap-1">
      {label}
      {help && <FieldHelp summary={help.summary} scale={help.scale} />}
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
          </div>
        )}

        {/*
          ── Pests — asked as a yes/no first ──

          Most trees on most walks have nothing on them, and a list of
          fifteen pests is a wall to scroll past in order to say so. The
          list only appears once something has been seen. It stays
          independent of health: a tree in good shape can still have
          codling moth on it, and catching that early is the point.
        */}
        {showPests && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              {sectionLabel('What you see', anyPests !== null, {
                summary:
                  'Anything on the tree or its fruit worth recording — insects, their damage, disease, browse, drought.',
                scale:
                  'The five most found in THIS orchard are shown; the rest are behind "more". Nothing ticked and "Nothing seen" tapped is an answer, and a useful one.',
              })}
              <button
                type="button"
                onClick={() => answerAnyPests(false)}
                aria-pressed={anyPests === false}
                disabled={busy}
                className={`shrink-0 text-[11px] font-semibold underline disabled:opacity-50 ${
                  anyPests === false ? 'text-canopy-700' : 'text-canopy-600 hover:text-canopy-700'
                }`}
              >
                {anyPests === false ? 'Nothing seen ✓' : 'Nothing seen'}
              </button>
            </div>
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

            {/* The causes a pest library cannot hold, in the same list: what
                you saw is one question, however it is categorised later. */}
            <div className="flex flex-wrap gap-1.5">
              {OTHER_CAUSES.map((cause) => {
                const on = causes.includes(cause);
                return (
                  <button
                    key={cause}
                    type="button"
                    onClick={() => toggleCause(cause)}
                    aria-pressed={on}
                    disabled={busy}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border active:scale-[0.97] disabled:opacity-50 ${
                      on
                        ? 'bg-canopy-700 border-canopy-700 text-white ring-2 ring-canopy-600 ring-offset-1'
                        : 'border-line text-ink bg-paper hover:bg-canopy-50'
                    }`}
                  >
                    {cause}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Bloom ── */}
        {inspections.has('bloom') && !bloomOpen && (
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => setBloomOpen(true)}
            disabled={busy}
          >
            Bloom
          </Button>
        )}
        {inspections.has('bloom') && bloomOpen && (
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
          </div>
        )}

        {/*
          ── Measurements ──

          Its own section rather than a tail on fruit load: the load is a
          glance at the whole tree, these are instruments applied to one
          fruit, and they are usually taken on a handful of trees rather
          than all of them.
        */}
        {inspections.has('fruit') && detailedFruit && enabledMetrics.length > 0 && (
          <div className="space-y-2">
            {sectionLabel(
              'Measurements',
              enabledMetrics.some((m) => (metrics[m.key] ?? '') !== ''),
              {
                summary:
                  'Optional readings taken off one representative fruit. Leave any of them blank.',
                scale: 'Hover or tap the question mark on a field to see what its scale means.',
              },
            )}
            <div className="grid grid-cols-2 gap-2">
              {enabledMetrics.map((m) => {
                const isSugar = m.key === 'brix';
                const isSize = m.key === 'size_mm';
                const asSg = isSugar && sugarUnit === 'sg';
                const asInches = isSize && sizeUnit === 'in';
                const help = METRIC_HELP[m.key];
                const label = asSg
                  ? 'Specific gravity'
                  : isSize
                    ? 'Fruit size'
                    : m.label.replace(/\s*\([^)]*\)\s*$/, '');
                const unit = asSg ? 'SG' : asInches ? 'in' : m.unit;
                const stored = previous?.metrics[m.key];
                const ghost = previousReading(m.key, stored, {
                  sugar: sugarUnit,
                  size: sizeUnit,
                });
                const delta = readingDelta(metrics[m.key] ?? '', stored);
                return (
                  <div key={m.key} className="min-w-0">
                    <span className="flex items-center gap-1 text-[11px] font-medium text-bark">
                      <span className="truncate">{label}</span>
                      {help && <FieldHelp summary={help.summary} scale={help.scale} />}
                      {/* The unit is the choice, so it is the control. */}
                      {isSugar || isSize ? (
                        <button
                          type="button"
                          onClick={() =>
                            isSugar
                              ? setSugarUnit(asSg ? 'brix' : 'sg')
                              : setSizeUnit(asInches ? 'mm' : 'in')
                          }
                          className="ml-auto shrink-0 rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase text-bark hover:bg-canopy-50 hover:text-ink"
                          title={
                            isSugar
                              ? 'Switch between °Brix and specific gravity'
                              : 'Switch between millimetres and inches'
                          }
                        >
                          {unit} ⇄
                        </button>
                      ) : (
                        <span className="ml-auto shrink-0 text-[10px] uppercase text-bark/70">
                          {unit}
                        </span>
                      )}
                    </span>
                    <Input
                      type="number"
                      step={asSg ? 0.001 : asInches ? 0.1 : m.step}
                      inputMode="decimal"
                      // The previous reading sits here as a placeholder:
                      // grey, in place, and gone the moment you type. It is
                      // never submitted, which is the whole point.
                      placeholder={
                        ghost?.ghost ?? (asSg ? '1.050' : asInches ? '2.4' : undefined)
                      }
                      value={metrics[m.key] ?? ''}
                      onChange={(e) => setMetric(m.key, e.target.value)}
                      className="h-10 mt-0.5"
                    />
                    {ghost && (
                      <span className="mt-0.5 block text-[10px] text-bark/80">
                        {ghost.was}
                        {delta && (
                          <span
                            className={
                              delta.direction === 'up'
                                ? ' font-semibold text-canopy-700'
                                : ' font-semibold text-flag-600'
                            }
                          >
                            {' '}
                            · {delta.text}
                          </span>
                        )}
                        {previous?.metricsOn ? ` · ${previous.metricsOn}` : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/*
          ── Tree condition ──

          At the trunk, not on the fruit. The anthracnose programme here is
          knife-first: carve each canker out, burn a stem carrying four or
          more. A count followed over seasons is how you know whether the
          cutting is winning, and which trees feed the block.
        */}
        {enabledCondition.length > 0 && (
          <div className="space-y-1.5">
            {sectionLabel(
              'Trunk and scaffolds',
              enabledCondition.some((m) => (condition[m.key] ?? '') !== ''),
              {
                summary: 'Cankers on the trunk and main limbs — counted, not judged.',
                scale:
                  'Four or more on most branches is the threshold for taking the tree out: it is an inoculum source for everything around it.',
              },
            )}
            <div className="grid grid-cols-2 gap-2">
              {enabledCondition.map((m) => {
                const stored = previous?.condition[m.key];
                const ghost = previousReading(m.key, stored, {
                  sugar: sugarUnit,
                  size: sizeUnit,
                });
                const delta = readingDelta(condition[m.key] ?? '', stored);
                return (
                  <div key={m.key} className="min-w-0">
                    <span className="flex items-center gap-1 text-[11px] font-medium text-bark">
                      <span className="truncate">{m.label.replace(/\s*\([^)]*\)\s*$/, '')}</span>
                      <span className="ml-auto shrink-0 text-[10px] uppercase text-bark/70">
                        {m.unit}
                      </span>
                    </span>
                    <Input
                      type="number"
                      step={m.step}
                      min="0"
                      inputMode="numeric"
                      placeholder={ghost?.ghost}
                      value={condition[m.key] ?? ''}
                      onChange={(e) => setCondition(m.key, e.target.value)}
                      className="h-10 mt-0.5"
                    />
                    {ghost && (
                      <span className="mt-0.5 block text-[10px] text-bark/80">
                        {ghost.was}
                        {delta && (
                          <span
                            className={
                              // More cankers is worse, so a rise is the
                              // warning here — the opposite of sugar.
                              delta.direction === 'up'
                                ? ' font-semibold text-flag-600'
                                : ' font-semibold text-canopy-700'
                            }
                          >
                            {' '}
                            · {delta.text}
                          </span>
                        )}
                        {previous?.conditionOn ? ` · ${previous.conditionOn}` : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/*
          ── When would you pick it? ──

          Every number in the harvest predictor is seeded; none is observed.
          A verdict from whoever is standing at the tree arrives weeks before
          a harvest date does, and it is recorded beside what the model said
          on the day, so the comparison is honest later.
        */}
        {askReadiness && (
          <div className="space-y-1.5">
            {sectionLabel('When would you pick it?', anyReadiness, {
              summary: multiVariety
                ? 'Your call for each variety on the tree, next to what the model predicted.'
                : 'Your call, next to what the model predicted.',
              scale:
                'This is how the prediction gets checked. The model has never seen a harvest here, so your answer outranks it.',
            })}
            {varieties.map((variety) => (
              <div key={variety} className="space-y-1.5">
                <p className="text-[11px] text-bark">
                  {multiVariety && <span className="font-semibold text-ink">{variety} — </span>}
                  {describePrediction(fetchedCentres[variety] ?? null, todayIso)}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {READINESS_VERDICTS.map((v) => {
                    const on = readiness[variety] === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => pickReadiness(variety, v)}
                        aria-pressed={on}
                        disabled={busy}
                        className={`h-11 rounded-lg text-sm font-medium border active:scale-[0.97] disabled:opacity-50 ${
                          on
                            ? 'bg-canopy-600 border-canopy-600 text-white'
                            : 'border-line text-ink bg-paper hover:bg-canopy-50'
                        }`}
                      >
                        {READINESS_LABEL[v]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/*
          ── Harvest ──

          Always here, not behind the picking verdict: that is only asked of
          a tree with a variety, and plenty of trees without one still bear.
          A tree is seldom picked in one go, so the season so far sits above
          the amount, and "complete" is the grower's word that it is done --
          no total can say whether 40 lb is all of it or half.
        */}
        <div className="space-y-1.5">
          {sectionLabel('Harvest', anyHarvest || harvestCompleteChoice !== null || varietyChoicePending, {
            summary: multiVariety
              ? 'What came off this tree today, a line for each variety picked.'
              : 'What came off this tree today, added to its season so far.',
            scale: multiVariety
              ? 'Each variety is picked out on its own; the tree is done when they all are.'
              : 'Pick it as often as it needs. Mark it complete when nothing is left; that holds until the end of the year.',
          })}
          <p className="text-[11px] text-bark">
            {season === null
              ? `${seasonYear} so far: …`
              : season.picks.length === 0
                ? `Nothing picked in ${seasonYear} yet`
                : `${seasonYear} so far: ` +
                  (multiVariety
                    ? season.by_variety
                        .map((v) => `${v.variety ?? 'unnamed'} ${v.total_lbs} lb`)
                        .join(' · ') + ` · ${season.total_lbs} lb total`
                    : `${season.total_lbs} lb · ${season.total_kg} kg · ${season.total_bushels} bu`) +
                  ` from ${season.picks.length} pick${season.picks.length === 1 ? '' : 's'}`}
          </p>
          {season && season.picks.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-bark">
              {season.picks.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>{formatYMD(p.harvest_date)}</span>
                  <span className="font-mono text-ink">{p.detail}</span>
                </li>
              ))}
            </ul>
          )}
          {harvestLines.map((line) => (
            <div key={line.key} className="space-y-1">
              {multiVariety && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Variety picked">
                  {varieties.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => updateLine(line.key, { variety: v })}
                      aria-pressed={sameVariety(line.variety, v)}
                      disabled={busy || line.saved}
                      className={`h-9 px-3 rounded-lg border text-sm font-medium ${
                        sameVariety(line.variety, v)
                          ? 'bg-canopy-700 border-canopy-700 text-white'
                          : 'bg-paper border-line text-ink hover:bg-canopy-50'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="Picked today"
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  disabled={busy || line.saved}
                  className="h-11 flex-1"
                  aria-label={line.variety ? `Amount of ${line.variety} harvested` : 'Amount harvested'}
                />
                <div className="flex rounded-lg border border-line overflow-hidden">
                  {HARVEST_UNITS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => updateLine(line.key, { unit: u })}
                      aria-pressed={line.unit === u}
                      disabled={busy || line.saved}
                      className={`px-3 text-sm font-medium ${
                        line.unit === u
                          ? 'bg-canopy-700 text-white'
                          : 'bg-paper text-ink hover:bg-canopy-50'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
                {harvestLines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    disabled={busy || line.saved}
                    aria-label="Remove this line"
                    className="px-2 rounded-lg text-bark hover:text-ink hover:bg-canopy-50 disabled:opacity-40"
                  >
                    <X size={16} aria-hidden />
                  </button>
                )}
              </div>
              {linePounds(line) !== null && (
                <p className="text-xs text-bark">
                  {line.variety && multiVariety ? `${line.variety}: ` : ''}
                  {describeHarvest(Number(line.quantity), line.unit, tree.fruit_type)} —{' '}
                  {line.saved ? 'recorded' : `saved with ${recordLabel}`}
                </p>
              )}
            </div>
          ))}
          {multiVariety && (
            <Button
              type="button"
              variant="secondary"
              className="h-10 w-full"
              onClick={addLine}
              disabled={busy}
            >
              <Plus aria-hidden size={15} /> Add line
            </Button>
          )}
          {multiVariety ? (
            <div className="space-y-1.5">
              {varieties.map((v) => {
                const savedDone = varietySavedComplete(v);
                const pending = varietyChoice[v];
                const shown = pending ?? savedDone;
                const completedOn = completions.find((c) => sameVariety(c.variety, v))?.completedOn;
                return (
                  <div key={v}>
                    <button
                      type="button"
                      onClick={() => toggleVarietyComplete(v)}
                      aria-pressed={shown}
                      disabled={busy}
                      className={`w-full h-11 rounded-lg text-sm font-medium border active:scale-[0.97] disabled:opacity-50 inline-flex items-center justify-center gap-1.5 ${
                        shown
                          ? 'bg-canopy-600 border-canopy-600 text-white'
                          : 'border-line text-ink bg-paper hover:bg-canopy-50'
                      }`}
                    >
                      {shown && <Check aria-hidden size={14} />}
                      {shown ? `${v} picked out` : `Mark ${v} picked out`}
                    </button>
                    <p className="text-[11px] text-bark">
                      {pending === true
                        ? `Closes ${v} for ${seasonYear} — saved with ${recordLabel}`
                        : pending === false
                          ? `Reopens ${v} — saved with ${recordLabel}`
                          : savedDone
                            ? `Picked out ${formatYMD(completedOn ?? null)} · tap to reopen`
                            : `Tap when there is no ${v} left to pick`}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleHarvestComplete}
                aria-pressed={shownComplete}
                disabled={busy}
                className={`w-full h-11 rounded-lg text-sm font-medium border active:scale-[0.97] disabled:opacity-50 inline-flex items-center justify-center gap-1.5 ${
                  shownComplete
                    ? 'bg-canopy-600 border-canopy-600 text-white'
                    : 'border-line text-ink bg-paper hover:bg-canopy-50'
                }`}
              >
                {shownComplete && <Check aria-hidden size={14} />}
                {shownComplete ? 'Harvest complete' : 'Mark harvest complete'}
              </button>
              {/* Says what the button will do, since tapping a finished tree
                  reopens it and a pending change waits for the record button. */}
              <p className="text-[11px] text-bark">
                {harvestCompleteChoice === true
                  ? `Closes this tree for ${seasonYear} — saved with ${recordLabel}`
                  : harvestCompleteChoice === false
                    ? `Reopens this tree — saved with ${recordLabel}`
                    : savedComplete
                      ? `Picked out ${formatYMD(season?.completed_on ?? tree.harvest_completed_on)} · tap to reopen`
                      : 'Tap when there is nothing left to pick'}
              </p>
            </>
          )}
        </div>

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
          {/*
            Proof the photo landed. It uploads and saves on its own, with
            nothing on screen to show for it, so people took a second one to
            be sure. The newest thumbnail and a count say it is done.
          */}
          {photos.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photos[photos.length - 1]}
                alt={`Last photo of ${tree.tree_id}`}
                className="h-9 w-9 rounded-md border border-line object-cover"
              />
              {photos.length > 1 && (
                <span className="text-[11px] font-medium text-bark">{photos.length}</span>
              )}
            </span>
          )}
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
