/**
 * What to tell the cidery about an orchard's harvests.
 *
 * OrchardMap records what came off the trees; CiderPilot buys it. Each
 * harvest row is sent there as a "pick", keyed by the harvest's own id, so
 * sending one again replaces what was sent before and an undo here takes it
 * back there. Once the cidery has received a pick into a purchase it is
 * "locked": theirs now, and nothing sent from here changes it.
 *
 * Everything in this file is pure. It decides what to send from what the
 * database holds; lib/db/ciderpilot.ts does the reading, the calling and
 * the writing.
 */

/** A harvest row with what is needed to describe it to the cidery. */
export interface HarvestForSync {
  id: number;
  /** YYYY-MM-DD. */
  harvestDate: string;
  weightLbs: number;
  /** As entered, where it was: 3 bushels. */
  quantity: number | null;
  unit: string | null;
  /** The pick's own variety, else the tree's. Null on a group harvest. */
  variety: string | null;
  treeId: string | null;
  brix: number | null;
  sg: number | null;
  ph: number | null;
  notes: string | null;
  /** True once the harvest was undone here. */
  undone: boolean;
  /** For a group harvest: the varieties its scope named, and its summary. */
  scopeVarieties: string[];
  scopeSummary: string | null;
}

/** One pick as CiderPilot's orchardmap.sendPicks accepts it. */
export interface PickPayload {
  harvestId: number;
  variety: string;
  harvestDate: string;
  weightLbs: number;
  quantity?: number;
  unit?: 'bushel' | 'lb' | 'kg';
  brix?: number;
  sg?: number;
  ph?: number;
  treeId?: string;
  notes?: string;
}

/** Where a harvest stands with the cidery, as last heard. */
export type PickSyncState = 'sent' | 'withdrawn' | 'locked';

export interface PickSyncRow {
  harvestId: number;
  state: PickSyncState;
  /** The payload as last accepted, to tell whether it has changed since. */
  sent: string | null;
}

const UNITS = ['bushel', 'lb', 'kg'] as const;

/** A reading the cidery will accept, or nothing: its bounds reject a typo outright. */
function within(value: number | null, min: number, max: number): number | undefined {
  return value !== null && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined;
}

/**
 * What a harvest is called there. A pick at a tree has a variety. A group
 * harvest has one only when its scope named exactly one; otherwise it is
 * sent as mixed, with the scope's own words, and the cidery says what it is
 * when the fruit arrives.
 */
export function pickVariety(harvest: HarvestForSync): string {
  const own = harvest.variety?.trim();
  if (own) return own;
  if (harvest.scopeVarieties.length === 1) return harvest.scopeVarieties[0];
  const summary = harvest.scopeSummary?.trim();
  return (summary ? `Mixed (${summary})` : 'Mixed').slice(0, 200);
}

/**
 * The pick to send for a harvest, or null when there is nothing sendable:
 * no weight, or no date. Readings outside what the cidery accepts are left
 * off rather than sent, so one odd number cannot hold up a whole day's picks.
 */
export function pickPayload(harvest: HarvestForSync): PickPayload | null {
  if (!(harvest.weightLbs > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(harvest.harvestDate)) return null;
  const unit = UNITS.find((u) => u === harvest.unit);
  const entered = harvest.quantity !== null && harvest.quantity > 0 && unit !== undefined;
  return {
    harvestId: harvest.id,
    variety: pickVariety(harvest),
    harvestDate: harvest.harvestDate,
    weightLbs: harvest.weightLbs,
    // Quantity and unit go together or not at all.
    ...(entered ? { quantity: harvest.quantity as number, unit } : {}),
    brix: within(harvest.brix, 0, 40),
    sg: within(harvest.sg, 0.98, 1.2),
    ph: within(harvest.ph, 2, 5),
    treeId: harvest.treeId?.slice(0, 100) || undefined,
    notes: harvest.notes?.trim().slice(0, 2000) || undefined,
  };
}

/** A payload as text, the same for the same pick whatever order its keys came in. */
export function payloadKey(payload: PickPayload): string {
  const entries = Object.entries(payload)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

export interface PickSyncPlan {
  /** Picks to send: new, or changed since they were last accepted. */
  send: PickPayload[];
  /** Harvest ids to take back: undone here after having been sent. */
  withdraw: number[];
}

/**
 * What needs telling, given every harvest in scope and what was last heard.
 *
 * - A live harvest is sent when it has never been, has changed, or was
 *   withdrawn and is live again.
 * - An undone harvest is withdrawn if the cidery still has it as sent.
 * - A locked harvest is left alone either way: the cidery has received it.
 */
export function planPickSync(
  harvests: readonly HarvestForSync[],
  synced: readonly PickSyncRow[],
): PickSyncPlan {
  const byId = new Map(synced.map((row) => [row.harvestId, row]));
  const plan: PickSyncPlan = { send: [], withdraw: [] };
  for (const harvest of harvests) {
    const row = byId.get(harvest.id);
    if (row?.state === 'locked') continue;
    if (harvest.undone) {
      if (row?.state === 'sent') plan.withdraw.push(harvest.id);
      continue;
    }
    const payload = pickPayload(harvest);
    if (!payload) continue;
    if (row?.state === 'sent' && row.sent === payloadKey(payload)) continue;
    plan.send.push(payload);
  }
  return plan;
}

/** What the cidery answered for one pick. */
export type PickOutcome = 'created' | 'updated' | 'locked' | 'withdrawn' | 'unknown';

/**
 * The state to record for an answer. Sent picks are remembered as sent with
 * what was sent. A withdrawal the cidery had never heard of ("unknown") is
 * as good as withdrawn. Locked is recorded so it is not tried again.
 */
export function stateAfter(outcome: PickOutcome): PickSyncState {
  if (outcome === 'locked') return 'locked';
  return outcome === 'created' || outcome === 'updated' ? 'sent' : 'withdrawn';
}

/** Split a list into runs of at most `size`, the most one call may carry. */
export function inChunks<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
