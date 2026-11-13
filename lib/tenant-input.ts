/**
 * Reading tenant-deciding ids out of untrusted input.
 *
 * Pure, so the rules can be tested without a database: these two
 * functions are where a request's claim about which orchard it concerns
 * is turned into something a guard can check.
 */

export type NamedOrchard =
  | { ok: true; orchardId: string }
  | { ok: false; reason: 'missing' | 'conflict' };

/**
 * The orchard a request names, under either spelling the router uses.
 *
 * Both spellings may not be sent with different values. The guard checks
 * one id and the procedure then reads whichever spelling its own schema
 * declares, so a request carrying `orchardId` for an orchard the caller
 * belongs to and `orchard_id` for one they do not was checked against
 * the first and written to the second.
 */
export function namedOrchardId(raw: unknown): NamedOrchard {
  const input = (raw ?? {}) as { orchardId?: unknown; orchard_id?: unknown };
  const camel = typeof input.orchardId === 'string' ? input.orchardId : '';
  const snake = typeof input.orchard_id === 'string' ? input.orchard_id : '';
  // A spelling present but not a string is not a second opinion to ignore.
  const malformed =
    (input.orchardId != null && camel === '') || (input.orchard_id != null && snake === '');
  if (malformed) return { ok: false, reason: camel || snake ? 'conflict' : 'missing' };
  if (camel && snake && camel !== snake) return { ok: false, reason: 'conflict' };
  const orchardId = camel || snake;
  return orchardId ? { ok: true, orchardId } : { ok: false, reason: 'missing' };
}

/**
 * The ids a request asks for that are not among the ones it may use.
 * Empty means every id is allowed. Order follows `wanted`, without
 * repeats, so the answer is stable for an error message or a test.
 */
export function idsOutside(wanted: readonly number[], allowed: readonly number[]): number[] {
  const ok = new Set(allowed);
  return [...new Set(wanted)].filter((id) => !ok.has(id));
}
