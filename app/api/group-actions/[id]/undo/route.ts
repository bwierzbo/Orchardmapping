import { NextRequest, NextResponse, after } from 'next/server';
import { syncOrchardPicksQuietly } from '@/lib/db/ciderpilot';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { groupActionOrchard, undoGroupAction } from '@/lib/db/group-actions';
import { orchardRole, roleAtLeast } from '@/lib/orchard-access';

/**
 * POST /api/group-actions/[id]/undo
 * Reverts a group action. set_field reverts only trees whose value is
 * still what the action set (changed-since trees are skipped/reported);
 * log_event hides its fan-out events from history.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, response } = await requireSession();
    if (response) return response;

    const { id } = await params;
    const groupId = Number(id);
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return NextResponse.json({ error: 'Invalid action id' }, { status: 400 });
    }

    // The action is named by number alone, so its orchard is resolved
    // here and membership checked before anything is reverted. Someone
    // outside the orchard gets the same answer as for a number that does
    // not exist: the route should not confirm another orchard's actions.
    const orchardId = await groupActionOrchard(groupId);
    const role = orchardId ? await orchardRole(orchardId, userId) : null;
    if (!role) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }
    if (!roleAtLeast(role, 'operator')) {
      return NextResponse.json(
        { error: `This needs operator access. You have ${role}.` },
        { status: 403 }
      );
    }

    const result = await undoGroupAction(groupId, userId);
    // An undone harvest is taken back from the cidery, if it was sent.
    if (orchardId) after(() => syncOrchardPicksQuietly(orchardId));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return handleApiError(error, 'POST /api/group-actions/[id]/undo');
  }
}
