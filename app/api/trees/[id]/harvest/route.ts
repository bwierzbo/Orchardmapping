import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { getTreeById } from '@/lib/db/trees';
import { insertTreeEvent } from '@/lib/db/tree-events';
import { insertTreeHarvest } from '@/lib/db/tree-harvests';
import { describeHarvest, HARVEST_UNITS, type HarvestUnit } from '@/lib/harvest-units';
import { assertTreeAccess } from '@/lib/orchard-access';
import { toYMD } from '@/lib/dates';

/**
 * POST /api/trees/[id]/harvest
 *
 * What came off this one tree. Writes three things that have to agree: the
 * harvests row (the quantity, for adding up), a harvest event (so it appears
 * in the tree's history beside everything else), and trees.last_harvest (so
 * the panel and the picking model can see when it was last picked).
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
    const quantity = Number(body.quantity);
    const unit = body.unit as HarvestUnit;
    const harvestDate = typeof body.harvest_date === 'string' ? body.harvest_date : null;

    if (!(HARVEST_UNITS as readonly string[]).includes(unit)) {
      return NextResponse.json(
        { error: `unit must be one of: ${HARVEST_UNITS.join(', ')}` },
        { status: 400 },
      );
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json(
        { error: 'quantity must be greater than zero' },
        { status: 400 },
      );
    }

    const date = harvestDate ?? toYMD(new Date());
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    const { weightLbs } = await insertTreeHarvest({
      treeId: tree_id,
      orchardId: tree.orchard_id,
      harvestDate: date,
      quantity,
      unit,
      fruitType: tree.fruit_type,
      notes,
      createdBy: userId,
    });

    const detail = describeHarvest(quantity, unit, tree.fruit_type);
    await insertTreeEvent({
      tree_id,
      orchard_id: tree.orchard_id,
      event_type: 'harvest',
      event_date: date,
      detail: notes ? `${detail} — ${notes}` : detail,
      changes: { quantity, unit, weight_lbs: weightLbs },
      created_by: userId,
      photo_url: typeof body.photo_url === 'string' ? body.photo_url : undefined,
    });

    return NextResponse.json({ success: true, weight_lbs: weightLbs, detail });
  } catch (error) {
    return handleApiError(error, 'POST /api/trees/[id]/harvest');
  }
}
