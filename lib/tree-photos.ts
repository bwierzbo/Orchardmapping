/**
 * A tree's photographs, gathered out of its event history.
 *
 * Photos are not a table of their own: each one rides on the event it was
 * taken for, which is what gives it a date and a reason. That is the right
 * storage -- a photo without the inspection it belonged to is just a
 * picture of a tree -- but it scatters them down a timeline between pruning
 * notes and fruit checks, so a tree's photographs can never be seen as a
 * series. This gathers them back into one.
 */

export interface TreePhoto {
  url: string;
  /** When the photo was taken, ISO date, or null if the event carried none. */
  date: string | null;
  /** What it was attached to, for the caption. */
  eventType: string;
  detail: string | null;
}

interface PhotoSource {
  event_type: string;
  event_date: string | null;
  created_at: string | null;
  detail: string | null;
  photo_url: string | null;
}

/**
 * Newest first, which is the order someone looking for "how does it look
 * now" wants, and reads backwards through the seasons from there.
 *
 * `event_date` is what the user said, `created_at` is when the row landed;
 * the first is the truth about the tree and the second is only a fallback
 * for events that never carried a date. The same photo attached to two
 * events appears once, keeping the earlier -- a duplicate url is the same
 * photograph, and the first time it was used is when it was taken.
 */
export function photosFromEvents(events: readonly PhotoSource[]): TreePhoto[] {
  const byUrl = new Map<string, TreePhoto>();
  for (const e of events) {
    const url = e.photo_url?.trim();
    if (!url) continue;
    const date = e.event_date ?? e.created_at ?? null;
    const existing = byUrl.get(url);
    if (existing && !isOlder(date, existing.date)) continue;
    byUrl.set(url, { url, date, eventType: e.event_type, detail: e.detail });
  }
  return [...byUrl.values()].sort((a, b) => {
    if (a.date === b.date) return 0;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? 1 : -1;
  });
}

/** A missing date is never older; it has nothing to be older than. */
function isOlder(a: string | null, b: string | null): boolean {
  if (a === null) return false;
  if (b === null) return true;
  return a < b;
}
