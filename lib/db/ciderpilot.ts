import { sql } from '@vercel/postgres';
import { toYMD } from '../dates';
import { toNum, toNumOrUndefined } from './decode';
import { callCiderPilot, ciderpilotConnection, CiderPilotError } from '../ciderpilot-client';
import {
  inChunks,
  payloadKey,
  planPickSync,
  stateAfter,
  type HarvestForSync,
  type PickOutcome,
  type PickPayload,
  type PickSyncRow,
  type PickSyncState,
} from '../ciderpilot-sync';

/**
 * Sending an orchard's harvests to CiderPilot, and remembering what it said.
 *
 * The rules are in lib/ciderpilot-sync.ts. This reads the harvests, makes
 * the calls and records the answers. A sync is always the whole orchard,
 * worked out from the database: there is no queue to lose, so a send that
 * failed is simply found again by the next one.
 */

/** The most picks CiderPilot takes in one call. */
const PICKS_PER_CALL = 500;

export interface CiderPilotSettings {
  enabled: boolean;
  /** YYYY-MM-DD; harvests before it are not sent. */
  since: string | null;
}

export async function ciderpilotSettings(orchardId: string): Promise<CiderPilotSettings | null> {
  const { rows } = await sql`
    SELECT ciderpilot_enabled, ciderpilot_since::text AS since
    FROM orchards WHERE id = ${orchardId}
  `;
  if (rows.length === 0) return null;
  return { enabled: rows[0].ciderpilot_enabled === true, since: toYMD(rows[0].since) };
}

/**
 * Turn sending on or off. The first time it is turned on, today becomes the
 * date sending starts from, and it stays that through later off-and-on: a
 * season already bought by other means must not arrive to be bought again.
 */
export async function setCiderpilotEnabled(
  orchardId: string,
  enabled: boolean,
  today: string,
): Promise<CiderPilotSettings | null> {
  const { rows } = await sql`
    UPDATE orchards
       SET ciderpilot_enabled = ${enabled},
           ciderpilot_since   = COALESCE(ciderpilot_since, ${enabled ? today : null}::date),
           updated_at         = NOW()
     WHERE id = ${orchardId}
     RETURNING ciderpilot_enabled, ciderpilot_since::text AS since
  `;
  if (rows.length === 0) return null;
  return { enabled: rows[0].ciderpilot_enabled === true, since: toYMD(rows[0].since) };
}

/** Every harvest in scope for sending, undone ones included. */
async function harvestsForSync(orchardId: string, since: string): Promise<HarvestForSync[]> {
  const { rows } = await sql`
    SELECT h.id, h.harvest_date::text AS harvest_date, h.weight_lbs, h.quantity, h.unit,
           COALESCE(NULLIF(btrim(h.variety), ''), NULLIF(btrim(t.variety), '')) AS variety,
           h.tree_id, h.brix, h.sg, h.ph, h.notes,
           (h.undone_at IS NOT NULL) AS undone,
           ga.scope
    FROM harvests h
    LEFT JOIN trees t ON t.tree_id = h.tree_id
    LEFT JOIN group_actions ga ON ga.id = h.group_action_id
    WHERE h.orchard_id = ${orchardId} AND h.harvest_date >= ${since}::date
    ORDER BY h.id
  `;
  return rows.map((r) => {
    const scope = (r.scope ?? {}) as { filter?: { varieties?: unknown }; summary?: unknown };
    const named = Array.isArray(scope.filter?.varieties)
      ? scope.filter.varieties.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      : [];
    return {
      id: Number(r.id),
      harvestDate: toYMD(r.harvest_date) ?? '',
      weightLbs: toNum(r.weight_lbs, 0),
      quantity: toNumOrUndefined(r.quantity) ?? null,
      unit: r.unit == null ? null : String(r.unit),
      variety: r.variety == null ? null : String(r.variety),
      treeId: r.tree_id == null ? null : String(r.tree_id),
      brix: toNumOrUndefined(r.brix) ?? null,
      sg: toNumOrUndefined(r.sg) ?? null,
      ph: toNumOrUndefined(r.ph) ?? null,
      notes: r.notes == null ? null : String(r.notes),
      undone: r.undone === true,
      scopeVarieties: named,
      scopeSummary: typeof scope.summary === 'string' ? scope.summary : null,
    };
  });
}

async function syncRows(orchardId: string): Promise<PickSyncRow[]> {
  const { rows } = await sql`
    SELECT harvest_id, state, sent FROM ciderpilot_pick_sync WHERE orchard_id = ${orchardId}
  `;
  return rows.map((r) => ({
    harvestId: Number(r.harvest_id),
    state: r.state as PickSyncState,
    sent: r.sent == null ? null : String(r.sent),
  }));
}

async function record(
  orchardId: string,
  harvestId: number,
  state: PickSyncState,
  sent: string | null,
): Promise<void> {
  // A locked answer keeps what was last accepted: that is what the cidery holds.
  await sql`
    INSERT INTO ciderpilot_pick_sync (harvest_id, orchard_id, state, sent, synced_at)
    VALUES (${harvestId}, ${orchardId}, ${state}, ${sent}, NOW())
    ON CONFLICT (harvest_id) DO UPDATE
      SET state = EXCLUDED.state,
          sent = CASE WHEN EXCLUDED.state = 'locked' THEN ciderpilot_pick_sync.sent ELSE EXCLUDED.sent END,
          synced_at = NOW()
  `;
}

export interface SyncResult {
  sent: number;
  withdrawn: number;
  /** Picks the cidery had already received, found while sending. */
  locked: number;
}

/**
 * Bring CiderPilot up to date with this orchard's harvests. Does nothing
 * when sending is off for the orchard or the deployment has no connection.
 * Throws CiderPilotError when the cidery refuses or cannot be reached;
 * what was accepted before the failure stays recorded.
 */
export async function syncOrchardPicks(orchardId: string): Promise<SyncResult> {
  const result: SyncResult = { sent: 0, withdrawn: 0, locked: 0 };
  const settings = await ciderpilotSettings(orchardId);
  if (!settings?.enabled || !settings.since || !ciderpilotConnection()) return result;

  const plan = planPickSync(
    await harvestsForSync(orchardId, settings.since),
    await syncRows(orchardId),
  );

  for (const picks of inChunks(plan.send, PICKS_PER_CALL)) {
    const answer = await callCiderPilot<{
      results: Array<{ harvestId: number; outcome: PickOutcome }>;
    }>('orchardmap.sendPicks', 'mutation', { orchardId, picks });
    const byId = new Map<number, PickPayload>(picks.map((pick) => [pick.harvestId, pick]));
    for (const { harvestId, outcome } of answer.results) {
      const pick = byId.get(harvestId);
      if (!pick) continue;
      const state = stateAfter(outcome);
      await record(orchardId, harvestId, state, payloadKey(pick));
      if (state === 'locked') result.locked++;
      else result.sent++;
    }
  }

  for (const harvestIds of inChunks(plan.withdraw, PICKS_PER_CALL)) {
    const answer = await callCiderPilot<{
      results: Array<{ harvestId: number; outcome: PickOutcome }>;
    }>('orchardmap.withdrawPicks', 'mutation', { orchardId, harvestIds });
    for (const { harvestId, outcome } of answer.results) {
      const state = stateAfter(outcome);
      await record(orchardId, harvestId, state, null);
      if (state === 'locked') result.locked++;
      else result.withdrawn++;
    }
  }
  return result;
}

/**
 * The same, for a caller that must not fail because the cidery did: a
 * harvest has been recorded and that stands whatever happens here. The next
 * sync finds whatever this one could not send.
 */
export async function syncOrchardPicksQuietly(orchardId: string): Promise<void> {
  try {
    await syncOrchardPicks(orchardId);
  } catch (error) {
    console.error(
      `CiderPilot sync for ${orchardId} failed:`,
      error instanceof CiderPilotError ? `${error.code ?? 'unreachable'} ${error.message}` : error,
    );
  }
}

export interface CiderPilotStatus {
  /** Whether this deployment has a connection at all. */
  connected: boolean;
  enabled: boolean;
  since: string | null;
  /** Where the cidery buys this orchard's fruit from, once it has linked it. */
  vendorName: string | null;
  /** Why the cidery could not be asked, when it could not. */
  problem: string | null;
  /** Harvests the cidery holds and has not yet received. */
  waiting: number;
  /** Harvests the cidery has received into a purchase. */
  received: number;
  /** Harvests not yet sent, or changed since. */
  toSend: number;
}

/** What an orchard's admin is shown about the link. */
export async function ciderpilotStatus(orchardId: string): Promise<CiderPilotStatus | null> {
  const settings = await ciderpilotSettings(orchardId);
  if (!settings) return null;
  const status: CiderPilotStatus = {
    connected: ciderpilotConnection() !== null,
    enabled: settings.enabled,
    since: settings.since,
    vendorName: null,
    problem: null,
    waiting: 0,
    received: 0,
    toSend: 0,
  };
  if (!status.connected || !settings.enabled || !settings.since) return status;

  const rows = await syncRows(orchardId);
  status.waiting = rows.filter((row) => row.state === 'sent').length;
  status.received = rows.filter((row) => row.state === 'locked').length;
  const plan = planPickSync(await harvestsForSync(orchardId, settings.since), rows);
  status.toSend = plan.send.length + plan.withdraw.length;

  try {
    const connection = await callCiderPilot<{
      orchards: Array<{ orchardId: string; vendorName: string }>;
    }>('orchardmap.connection', 'query');
    status.vendorName =
      connection.orchards.find((orchard) => orchard.orchardId === orchardId)?.vendorName ?? null;
  } catch (error) {
    status.problem = error instanceof Error ? error.message : 'CiderPilot could not be reached';
  }
  return status;
}
