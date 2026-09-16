import {
  loadLocalWalkProgress,
  markTreeInspected,
  newerWalkProgress,
  normalizeWalkProgress,
  saveLocalWalkProgress,
  type WalkProgress,
} from '../walk-progress';

/** Server copy of a walk in progress — best-effort; callers keep a local copy. */

export async function fetchWalkProgress(orchardId: string): Promise<WalkProgress | null> {
  const res = await fetch(`/api/walk-progress?orchard=${encodeURIComponent(orchardId)}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { progress?: unknown };
  return normalizeWalkProgress(body.progress);
}

export async function putWalkProgress(progress: WalkProgress): Promise<void> {
  await fetch('/api/walk-progress', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(progress),
    keepalive: true, // survives the tab closing mid-save
  });
}

export async function deleteWalkProgress(orchardId: string): Promise<void> {
  await fetch(`/api/walk-progress?orchard=${encodeURIComponent(orchardId)}`, {
    method: 'DELETE',
    keepalive: true,
  });
}

/**
 * A tree was inspected from the panel: if a paused walk for this orchard
 * covers it, mark it assessed there (local copy and server copy) so the
 * walk skips it on resume. Returns true when a walk was updated.
 */
export async function recordInspectionInSavedWalk(
  orchardId: string,
  treeId: string,
  saved: number
): Promise<boolean> {
  const local = loadLocalWalkProgress(orchardId);
  let remote: WalkProgress | null = null;
  try {
    remote = await fetchWalkProgress(orchardId);
  } catch {
    /* offline — the local copy still gets it */
  }
  const current = newerWalkProgress(local, remote);
  if (!current) return false;
  const updated = markTreeInspected(current, treeId, saved);
  if (!updated) return false;
  saveLocalWalkProgress(updated);
  await putWalkProgress(updated).catch(() => {});
  return true;
}
