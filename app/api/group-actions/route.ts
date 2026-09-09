import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import {
  applyGroupAction,
  listGroupActions,
  GROUP_SETTABLE_FIELDS,
  type GroupActionInput,
} from '@/lib/db/group-actions';
import { MANUAL_EVENT_TYPES } from '@/lib/db/tree-events';
import type { GroupFilter } from '@/lib/group-filter';

function sanitizeFilter(raw: unknown): GroupFilter {
  const f = (raw ?? {}) as Record<string, unknown>;
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : undefined;
  return {
    rows: strings(f.rows),
    varieties: strings(f.varieties),
    statuses: strings(f.statuses),
    blocks: strings(f.blocks),
  };
}

/** GET /api/group-actions?orchard_id= — recent actions for the undo panel. */
export async function GET(request: NextRequest) {
  try {
    const orchardId = request.nextUrl.searchParams.get('orchard_id');
    if (!orchardId) {
      return NextResponse.json({ error: 'Missing orchard_id' }, { status: 400 });
    }
    const actions = await listGroupActions(orchardId);
    return NextResponse.json({ success: true, actions });
  } catch (error) {
    return handleApiError(error, 'GET /api/group-actions');
  }
}

/** POST /api/group-actions — apply an event or field change to a filtered group. */
export async function POST(request: NextRequest) {
  try {
    const { userId, response } = await requireSession();
    if (response) return response;

    const body = await request.json();
    const orchardId = String(body.orchard_id ?? '');
    if (!orchardId) {
      return NextResponse.json({ error: 'Missing orchard_id' }, { status: 400 });
    }
    const filter = sanitizeFilter(body.filter);

    let action: GroupActionInput;
    if (body.action?.kind === 'log_event') {
      const eventType = String(body.action.event_type ?? '');
      if (!(MANUAL_EVENT_TYPES as readonly string[]).includes(eventType)) {
        return NextResponse.json(
          { error: `event_type must be one of: ${MANUAL_EVENT_TYPES.join(', ')}` },
          { status: 400 }
        );
      }
      const eventDate = body.action.event_date ? String(body.action.event_date) : undefined;
      if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
        return NextResponse.json({ error: 'event_date must be YYYY-MM-DD' }, { status: 400 });
      }
      action = {
        kind: 'log_event',
        eventType: eventType as (typeof MANUAL_EVENT_TYPES)[number],
        eventDate,
        detail:
          typeof body.action.detail === 'string' && body.action.detail.trim()
            ? body.action.detail.trim()
            : undefined,
      };
    } else if (body.action?.kind === 'set_field') {
      const field = String(body.action.field ?? '');
      if (!(GROUP_SETTABLE_FIELDS as readonly string[]).includes(field)) {
        return NextResponse.json(
          { error: `field must be one of: ${GROUP_SETTABLE_FIELDS.join(', ')}` },
          { status: 400 }
        );
      }
      const value =
        body.action.value === null || body.action.value === ''
          ? null
          : String(body.action.value);
      action = { kind: 'set_field', field, value };
    } else {
      return NextResponse.json(
        { error: 'action.kind must be log_event or set_field' },
        { status: 400 }
      );
    }

    const result = await applyGroupAction(orchardId, filter, action, userId);
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'POST /api/group-actions');
  }
}
