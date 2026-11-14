import { describe, it, expect } from 'vitest';
import {
  inChunks,
  payloadKey,
  pickPayload,
  pickVariety,
  planPickSync,
  stateAfter,
  type HarvestForSync,
  type PickSyncRow,
} from './ciderpilot-sync';

const harvest = (over: Partial<HarvestForSync> = {}): HarvestForSync => ({
  id: 1,
  harvestDate: '2026-10-03',
  weightLbs: 126,
  quantity: 3,
  unit: 'bushel',
  variety: 'Kingston Black',
  treeId: 'OBC-001-0142',
  brix: null,
  sg: null,
  ph: null,
  notes: null,
  undone: false,
  scopeVarieties: [],
  scopeSummary: null,
  ...over,
});

describe('pickVariety', () => {
  it("uses the pick's own variety", () => {
    expect(pickVariety(harvest({ variety: '  Dabinett ' }))).toBe('Dabinett');
  });

  it('uses the one variety a group harvest named', () => {
    expect(pickVariety(harvest({ variety: null, scopeVarieties: ['Yarlington Mill'] }))).toBe(
      'Yarlington Mill',
    );
  });

  it('calls a group harvest of several varieties mixed, in its own words', () => {
    expect(
      pickVariety(
        harvest({ variety: null, scopeVarieties: ['A', 'B'], scopeSummary: 'Block 2, rows 1-4' }),
      ),
    ).toBe('Mixed (Block 2, rows 1-4)');
    expect(pickVariety(harvest({ variety: null }))).toBe('Mixed');
  });
});

describe('pickPayload', () => {
  it('describes a pick at a tree', () => {
    expect(pickPayload(harvest())).toEqual({
      harvestId: 1,
      variety: 'Kingston Black',
      harvestDate: '2026-10-03',
      weightLbs: 126,
      quantity: 3,
      unit: 'bushel',
      brix: undefined,
      sg: undefined,
      ph: undefined,
      treeId: 'OBC-001-0142',
      notes: undefined,
    });
  });

  it('sends quantity and unit together or not at all', () => {
    const noUnit = pickPayload(harvest({ unit: null }))!;
    expect(noUnit.quantity).toBeUndefined();
    expect(noUnit.unit).toBeUndefined();
    const oddUnit = pickPayload(harvest({ unit: 'crate' }))!;
    expect(oddUnit.quantity).toBeUndefined();
    expect(oddUnit.unit).toBeUndefined();
  });

  it('keeps readings the cidery accepts and drops ones it would reject', () => {
    const good = pickPayload(harvest({ brix: 13.2, sg: 1.054, ph: 3.41 }))!;
    expect(good).toMatchObject({ brix: 13.2, sg: 1.054, ph: 3.41 });
    // 1054 for 1.054, a pH of 34: typos, not fruit.
    const odd = pickPayload(harvest({ brix: 130, sg: 1054, ph: 34 }))!;
    expect(odd.brix).toBeUndefined();
    expect(odd.sg).toBeUndefined();
    expect(odd.ph).toBeUndefined();
    expect(odd.weightLbs).toBe(126);
  });

  it('has nothing to send for a harvest with no weight or no proper date', () => {
    expect(pickPayload(harvest({ weightLbs: 0 }))).toBeNull();
    expect(pickPayload(harvest({ harvestDate: '10/03/2026' }))).toBeNull();
  });
});

describe('payloadKey', () => {
  it('is the same for the same pick and different once anything changes', () => {
    const a = pickPayload(harvest())!;
    const b = pickPayload(harvest())!;
    expect(payloadKey(a)).toBe(payloadKey(b));
    expect(payloadKey(a)).not.toBe(payloadKey(pickPayload(harvest({ weightLbs: 84 }))!));
    expect(payloadKey(a)).not.toBe(payloadKey(pickPayload(harvest({ notes: 'south rows' }))!));
  });

  it('does not depend on key order', () => {
    const p = pickPayload(harvest())!;
    const reordered = Object.fromEntries(Object.entries(p).reverse()) as typeof p;
    expect(payloadKey(reordered)).toBe(payloadKey(p));
  });
});

describe('planPickSync', () => {
  const sentRow = (h: HarvestForSync): PickSyncRow => ({
    harvestId: h.id,
    state: 'sent',
    sent: payloadKey(pickPayload(h)!),
  });

  it('sends a harvest the cidery has never heard of', () => {
    const plan = planPickSync([harvest()], []);
    expect(plan.send.map((p) => p.harvestId)).toEqual([1]);
    expect(plan.withdraw).toEqual([]);
  });

  it('says nothing about a harvest already sent and unchanged', () => {
    const h = harvest();
    expect(planPickSync([h], [sentRow(h)])).toEqual({ send: [], withdraw: [] });
  });

  it('sends again once the harvest has changed', () => {
    const before = harvest();
    const after = harvest({ weightLbs: 84, quantity: 2 });
    const plan = planPickSync([after], [sentRow(before)]);
    expect(plan.send).toHaveLength(1);
    expect(plan.send[0].weightLbs).toBe(84);
  });

  it('withdraws a sent harvest that was undone here, once', () => {
    const h = harvest();
    const undone = harvest({ undone: true });
    expect(planPickSync([undone], [sentRow(h)])).toEqual({ send: [], withdraw: [1] });
    expect(
      planPickSync([undone], [{ harvestId: 1, state: 'withdrawn', sent: null }]),
    ).toEqual({ send: [], withdraw: [] });
  });

  it('never sends a harvest undone before it was ever sent', () => {
    expect(planPickSync([harvest({ undone: true })], [])).toEqual({ send: [], withdraw: [] });
  });

  it('sends again a harvest that was withdrawn and is live once more', () => {
    const plan = planPickSync([harvest()], [{ harvestId: 1, state: 'withdrawn', sent: null }]);
    expect(plan.send.map((p) => p.harvestId)).toEqual([1]);
  });

  it('leaves a locked harvest alone whether changed or undone: the cidery has received it', () => {
    const locked: PickSyncRow = { harvestId: 1, state: 'locked', sent: 'whatever' };
    expect(planPickSync([harvest({ weightLbs: 1 })], [locked])).toEqual({ send: [], withdraw: [] });
    expect(planPickSync([harvest({ undone: true })], [locked])).toEqual({ send: [], withdraw: [] });
  });

  it('plans each harvest on its own', () => {
    const a = harvest({ id: 1 });
    const b = harvest({ id: 2, undone: true });
    const c = harvest({ id: 3, weightLbs: 0 });
    const d = harvest({ id: 4 });
    const plan = planPickSync([a, b, c, d], [sentRow(a), sentRow(harvest({ id: 2 }))]);
    expect(plan.send.map((p) => p.harvestId)).toEqual([4]);
    expect(plan.withdraw).toEqual([2]);
  });
});

describe('stateAfter', () => {
  it('records what the cidery answered', () => {
    expect(stateAfter('created')).toBe('sent');
    expect(stateAfter('updated')).toBe('sent');
    expect(stateAfter('locked')).toBe('locked');
    expect(stateAfter('withdrawn')).toBe('withdrawn');
    expect(stateAfter('unknown')).toBe('withdrawn');
  });
});

describe('inChunks', () => {
  it('splits into runs no longer than the limit, keeping order and every item', () => {
    expect(inChunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(inChunks([], 2)).toEqual([]);
    expect(inChunks([1], 500)).toEqual([[1]]);
  });
});
