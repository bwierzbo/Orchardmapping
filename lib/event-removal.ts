/**
 * Taking a mistake back out of a tree's history: the rules, kept apart from
 * the database module so the history panel can ask "may this row be
 * deleted?" without pulling a Postgres client into the browser.
 */

/**
 * The rows that stay. They are the audit trail of edits to the tree itself
 * -- created, edited, moved, deleted -- and deleting one would not undo the
 * edit, only hide that it happened. Marking a tree's harvest complete or
 * reopening it is the same: the undo is the button that does the opposite,
 * which leaves a row of its own.
 *
 * Everything else can go: whatever could be written by hand, everything the
 * Inspect form writes, and the status change an inspection makes.
 */
export const PERMANENT_EVENT_TYPES = [
  'created',
  'updated',
  'moved',
  'deleted',
  'harvest_complete',
  'harvest_reopened',
] as const;

export function isRemovableEventType(type: string): boolean {
  return !(PERMANENT_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * The status a tree should carry once a status change is deleted, or null
 * to leave it alone.
 *
 * Only the tree's latest status change set what it shows now, so deleting an
 * older one changes nothing. And if the status has moved since (an edit, a
 * group action), that later decision stands -- the same rule group undo
 * follows, so a delete never clobbers newer work.
 */
export function statusAfterRemoval(input: {
  current: string | null;
  removed: { from: unknown; to: unknown };
  removedIsLatest: boolean;
  /** The `to` of the latest status change left after this one goes. */
  previousTo: string | null;
}): string | null {
  if (!input.removedIsLatest) return null;
  if (String(input.current ?? '') !== String(input.removed.to ?? '')) return null;
  const from = input.removed.from == null ? null : String(input.removed.from);
  return input.previousTo ?? from ?? 'unknown';
}

/**
 * Whether an event has anything left once its photo is taken off it. A photo
 * taken on its own lands as an observation carrying nothing but the picture;
 * without the picture it is an empty row, so it goes too. A spray that had a
 * photo attached is still a spray.
 */
export function isEmptyWithoutPhoto(e: {
  event_type: string;
  detail: string | null;
  changes: Record<string, unknown> | null;
}): boolean {
  return (
    e.event_type === 'observation' &&
    !e.detail?.trim() &&
    (!e.changes || Object.keys(e.changes).length === 0)
  );
}
