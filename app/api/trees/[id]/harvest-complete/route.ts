import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { getTreeById } from '@/lib/db/trees';
import { insertTreeEvent } from '@/lib/db/tree-events';
import { setTreeHarvestCompletedOn } from '@/lib/db/tree-harvests';
import { isHarvestComplete } from '@/lib/tree-harvest-season';
import { assertTreeAccess } from '@/lib/orchard-access';
import { toYMD } from '@/lib/dates';
import { listGrafts, setVarietyHarvestComplete } from '@/lib/db/grafts';
import { picksByVariety } from '@/lib/grafts';

/**
 * POST /api/trees/[id]/harvest-complete
 *
 * Body: { complete: boolean, date?: 'YYYY-MM-DD' }
 *
 * Marks this tree picked out for the season, or opens it again. Two writes
 * that have to agree: trees.harvest_completed_on, and a harvest_complete /
 * harvest_reopened event so the history says when and who. The date comes
 * from the client because it is the grower's day that matters -- the
 * server's would close a tree in the wrong year on New Year's Eve.
 *
 * Asking for the state the tree is already in writes nothing, so a double
 * tap does not leave two "Harvest complete" rows.
 *
 * A grafted tree is closed one variety at a time (076): the body names the
 * variety, and the whole tree counts as picked out once every variety on
 * it is (setVarietyHarvestComplete).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId, response } = await requireSession();
    if (response) return response;

    const { id: tree_id } = await params;
    const denied = await assertTreeAccess(tree_id, userId, 'operator');
    if (denied) return denied;

    const tree = await getTreeById(tree_id);
    if (!tree) {
      return NextResponse.json({ error: 'Tree not found' }, { status: 404 });
    }

    const body = await request.json();
    if (typeof body.complete !== 'boolean') {
      return NextResponse.json({ error: 'complete must be true or false' }, { status: 400 });
    }
    if (body.date !== undefined && !(typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date))) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }
    const date: string = body.date ?? toYMD(new Date());

    if (picksByVariety(tree.variety, await listGrafts(tree_id))) {
      if (typeof body.variety !== 'string' || !body.variety.trim()) {
        return NextResponse.json(
          { error: 'This tree has more than one variety: say which one is picked out' },
          { status: 400 },
        );
      }
      const result = await setVarietyHarvestComplete(tree_id, body.variety, body.complete, date, userId);
      return NextResponse.json({
        success: true,
        harvest_completed_on: result.wholeCompletedOn,
        variety: result.variety,
        variety_completed_on: result.varietyCompletedOn,
      });
    }

    const year = Number(date.slice(0, 4));
    const before = toYMD(tree.harvest_completed_on ?? null);

    if (body.complete) {
      if (isHarvestComplete(before, year)) {
        return NextResponse.json({ success: true, harvest_completed_on: before });
      }
      await setTreeHarvestCompletedOn(tree_id, date);
      await insertTreeEvent({
        tree_id,
        orchard_id: tree.orchard_id,
        event_type: 'harvest_complete',
        event_date: date,
        detail: `Picked out for ${year}`,
        changes: { harvest_completed_on: { from: before, to: date } },
        created_by: userId,
      });
      return NextResponse.json({ success: true, harvest_completed_on: date });
    }

    // Reopening clears the date whatever year it is from: a stale date from
    // an earlier season already reads as open, and leaving it would only
    // make the next "complete" look like a change from it.
    if (before === null) {
      return NextResponse.json({ success: true, harvest_completed_on: null });
    }
    await setTreeHarvestCompletedOn(tree_id, null);
    await insertTreeEvent({
      tree_id,
      orchard_id: tree.orchard_id,
      event_type: 'harvest_reopened',
      event_date: date,
      detail: 'Reopened — more to pick',
      changes: { harvest_completed_on: { from: before, to: null } },
      created_by: userId,
    });
    return NextResponse.json({ success: true, harvest_completed_on: null });
  } catch (error) {
    return handleApiError(error, 'POST /api/trees/[id]/harvest-complete');
  }
}
