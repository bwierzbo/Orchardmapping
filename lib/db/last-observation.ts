/**
 * What this tree showed last time, so the walk can show it beside the
 * empty field rather than inside it.
 *
 * A measurement is never carried forward as a value. A starch index of 4
 * from nine days ago, written into today's record because nobody cleared
 * the box, is a false reading dated today -- and the starch TRAJECTORY is
 * exactly what the harvest predictor reads. So the previous number is
 * shown greyed, as context, and the field it sits in starts empty.
 *
 * Health and crop load are different: you are looking at the tree, and
 * confirming what it was is a fair single tap. Those come back as values
 * the form marks "carried over" until touched.
 */
import { sql } from '@vercel/postgres';

export interface LastObservation {
  /** When anything was last recorded against this tree, ISO date. */
  observedOn: string;
  /** Measurements from the most recent fruit check, by metric key. */
  metrics: Record<string, number>;
  /** Date of that fruit check, which may be older than observedOn. */
  metricsOn: string | null;
  /** Pests seen on the most recent observation, by key. */
  pests: string[];
  pestsOn: string | null;
  /** Trunk counts from the most recent condition check. */
  condition: Record<string, number>;
  conditionOn: string | null;
}

function numbers(changes: unknown): Record<string, number> {
  if (!changes || typeof changes !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(changes as Record<string, unknown>)) {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

/**
 * The last of each kind of observation for one tree. One query over the
 * tree's own history, which is indexed by tree and date.
 */
export async function lastObservationForTree(treeId: string): Promise<LastObservation | null> {
  const { rows } = await sql`
    SELECT event_type, event_date::text AS event_date, changes
    FROM tree_events
    WHERE tree_id = ${treeId}
      AND event_type IN ('fruit_check', 'observation', 'tree_condition', 'status_change', 'bloom')
    ORDER BY event_date DESC, id DESC
    LIMIT 60
  `;
  if (rows.length === 0) return null;

  const result: LastObservation = {
    observedOn: String(rows[0].event_date),
    metrics: {},
    metricsOn: null,
    pests: [],
    pestsOn: null,
    condition: {},
    conditionOn: null,
  };

  for (const row of rows) {
    const kind = String(row.event_type);
    const on = String(row.event_date);
    if (kind === 'fruit_check' && result.metricsOn === null) {
      const all = numbers(row.changes);
      // `load` is the 1-5 crop load, not a measurement; the form treats it
      // separately because it is a glance at the tree, not an instrument.
      const { load, ...rest } = all;
      result.metrics = rest;
      if (Number.isFinite(load)) result.metrics.load = load;
      result.metricsOn = on;
    }
    if (kind === 'tree_condition' && result.conditionOn === null) {
      result.condition = numbers(row.changes);
      result.conditionOn = on;
    }
    if (kind === 'observation' && result.pestsOn === null) {
      const changes = row.changes as { pests?: Record<string, unknown> } | null;
      if (changes?.pests && typeof changes.pests === 'object') {
        result.pests = Object.keys(changes.pests);
        result.pestsOn = on;
      }
    }
  }

  return result;
}
