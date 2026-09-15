import type { ClientTree } from './types';

/**
 * A walk survey in progress — enough to put the surveyor back on the
 * same tree with the same route after closing the app. Saved locally on
 * every step (works offline in the field) and mirrored to the server so
 * another device can pick it up.
 */
export type WalkInspection = 'health' | 'bloom' | 'fruit';

export interface WalkProgress {
  version: 1;
  orchardId: string;
  inspections: WalkInspection[];
  detailedFruit: boolean;
  /** Route as tree ids, in walking order. */
  pathIds: string[];
  /** Index where the second leg starts (== pathIds.length when none). */
  turnaround: number;
  /** The tree the walker is on. */
  currentId: string | null;
  /** Trees with at least one inspection recorded on this walk. */
  doneIds: string[];
  /** Inspections + notes recorded so far (the sheet's counter). */
  recorded: number;
  startedAt: string;
  updatedAt: string;
}

const INSPECTIONS: WalkInspection[] = ['health', 'bloom', 'fruit'];

/** Shape-check a stored/received value; null when it isn't a walk. */
export function normalizeWalkProgress(raw: unknown): WalkProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const strings = (v: unknown): string[] | null =>
    Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;
  const pathIds = strings(p.pathIds);
  const doneIds = strings(p.doneIds) ?? [];
  const inspections = strings(p.inspections)?.filter((i): i is WalkInspection =>
    (INSPECTIONS as string[]).includes(i)
  );
  if (
    p.version !== 1 ||
    typeof p.orchardId !== 'string' ||
    !p.orchardId ||
    !pathIds ||
    pathIds.length === 0 ||
    !inspections ||
    inspections.length === 0
  ) {
    return null;
  }
  const turnaround =
    typeof p.turnaround === 'number' && p.turnaround >= 0 && p.turnaround <= pathIds.length
      ? Math.floor(p.turnaround)
      : pathIds.length;
  const iso = (v: unknown, fallback: string) =>
    typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : fallback;
  const now = new Date().toISOString();
  return {
    version: 1,
    orchardId: p.orchardId,
    inspections,
    detailedFruit: p.detailedFruit === true,
    pathIds,
    turnaround,
    currentId: typeof p.currentId === 'string' ? p.currentId : null,
    doneIds,
    recorded: typeof p.recorded === 'number' && p.recorded >= 0 ? Math.floor(p.recorded) : 0,
    startedAt: iso(p.startedAt, now),
    updatedAt: iso(p.updatedAt, now),
  };
}

/** The newer of two saved copies (either may be missing). */
export function newerWalkProgress(
  a: WalkProgress | null,
  b: WalkProgress | null
): WalkProgress | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b : a;
}

export interface ResumedRoute {
  path: ClientTree[];
  turnaround: number;
  /** Where to put the walker: the saved tree, else the first unassessed one. */
  index: number;
  done: Set<string>;
}

/**
 * Rebuild a saved route against the current tree list. Trees deleted
 * since the walk started drop out (the turnaround shifts with them);
 * the walker resumes on the saved tree, or the first tree not yet
 * assessed if that one is gone. Null when nothing of the route survives.
 */
export function resumeRoute(progress: WalkProgress, trees: ClientTree[]): ResumedRoute | null {
  const byId = new Map(trees.map((t) => [t.tree_id, t]));
  const path: ClientTree[] = [];
  let turnaround = 0;
  progress.pathIds.forEach((id, i) => {
    const t = byId.get(id);
    if (!t) return;
    path.push(t);
    if (i < progress.turnaround) turnaround++;
  });
  if (path.length === 0) return null;
  const done = new Set(progress.doneIds.filter((id) => byId.has(id)));
  let index = progress.currentId ? path.findIndex((t) => t.tree_id === progress.currentId) : -1;
  if (index < 0) index = path.findIndex((t) => !done.has(t.tree_id));
  if (index < 0) index = path.length - 1;
  return { path, turnaround, index, done };
}

// ── Local persistence (per device; the server copy is the cross-device one) ──

const storageKey = (orchardId: string) => `walk-progress:${orchardId}`;

export function loadLocalWalkProgress(orchardId: string): WalkProgress | null {
  try {
    const raw = window.localStorage.getItem(storageKey(orchardId));
    const parsed = raw ? normalizeWalkProgress(JSON.parse(raw)) : null;
    return parsed && parsed.orchardId === orchardId ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLocalWalkProgress(progress: WalkProgress): void {
  try {
    window.localStorage.setItem(storageKey(progress.orchardId), JSON.stringify(progress));
  } catch {
    /* private mode / quota — the server copy still gets it */
  }
}

export function clearLocalWalkProgress(orchardId: string): void {
  try {
    window.localStorage.removeItem(storageKey(orchardId));
  } catch {
    /* nothing to clear */
  }
}
