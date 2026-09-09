import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { undoGroupAction } from '@/lib/db/group-actions';

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

    const result = await undoGroupAction(groupId, userId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return handleApiError(error, 'POST /api/group-actions/[id]/undo');
  }
}
