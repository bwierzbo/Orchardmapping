import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { listTreeEvents, removeTreeEvent, toClientEvents } from '@/lib/db/tree-events';
import { assertTreeAccess } from '@/lib/orchard-access';

/**
 * DELETE /api/trees/[id]/events/[eventId]
 * Take an entry back out of a tree's history -- an inspection recorded on
 * the wrong tree, a wrong load, a status tapped by mistake -- along with
 * what it changed (see removeTreeEvent). Returns the history and the
 * tree's status as they now stand.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  try {
    const { userId, response } = await requireSession();
    if (response) return response;

    const { id: tree_id, eventId } = await params;
    const denied = await assertTreeAccess(tree_id, userId, 'operator');
    if (denied) return denied;

    const id = Number(eventId);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
    }

    const { status } = await removeTreeEvent(tree_id, id);
    const events = await listTreeEvents(tree_id);
    return NextResponse.json({ success: true, status, events: toClientEvents(events) });
  } catch (error) {
    return handleApiError(error, 'DELETE /api/trees/[id]/events/[eventId]');
  }
}
