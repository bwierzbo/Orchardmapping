import { normalizeWalkProgress, type WalkProgress } from '../walk-progress';

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
