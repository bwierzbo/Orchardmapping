import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { getTreeById } from '@/lib/db/trees';
import {
  insertTreeEvent,
  listTreeEvents,
  MANUAL_EVENT_TYPES,
  type TreeEventType,
} from '@/lib/db/tree-events';
import { toYMD } from '@/lib/dates';

/**
 * GET /api/trees/[id]/events
 * History log for one tree, newest first (public, like tree reads).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tree_id } = await params;
    const events = await listTreeEvents(tree_id);
    return NextResponse.json({
      success: true,
      events: events.map((e) => ({
        ...e,
        event_date: toYMD(e.event_date),
        created_at: e.created_at ? new Date(e.created_at).toISOString() : null,
      })),
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/trees/[id]/events');
  }
}

/**
 * POST /api/trees/[id]/events
 * Log a manual field activity (pruning, spray, observation, …).
 * Requires authentication.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, response } = await requireSession();
    if (response) return response;

    const { id: tree_id } = await params;
    const tree = await getTreeById(tree_id);
    if (!tree) {
      return NextResponse.json({ error: 'Tree not found' }, { status: 404 });
    }

    const body = await request.json();
    const eventType = String(body.event_type ?? '');
    if (!(MANUAL_EVENT_TYPES as readonly string[]).includes(eventType)) {
      return NextResponse.json(
        { error: `event_type must be one of: ${MANUAL_EVENT_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const eventDate = body.event_date ? String(body.event_date) : undefined;
    if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      return NextResponse.json(
        { error: 'event_date must be YYYY-MM-DD' },
        { status: 400 }
      );
    }

    await insertTreeEvent({
      tree_id,
      orchard_id: tree.orchard_id,
      event_type: eventType as TreeEventType,
      event_date: eventDate,
      detail: typeof body.detail === 'string' && body.detail.trim() ? body.detail.trim() : undefined,
      created_by: userId,
    });

    const events = await listTreeEvents(tree_id);
    return NextResponse.json(
      {
        success: true,
        events: events.map((e) => ({
          ...e,
          event_date: toYMD(e.event_date),
          created_at: e.created_at ? new Date(e.created_at).toISOString() : null,
        })),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, 'POST /api/trees/[id]/events');
  }
}
