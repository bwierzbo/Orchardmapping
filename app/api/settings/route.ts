import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { getSetting, putSetting } from '@/lib/db/app-settings';
import { normalizeWalkSettings } from '@/lib/settings';

const WALK_KEY = 'walk_settings';

/** GET /api/settings — current walk-survey configuration (defaults merged). */
export async function GET() {
  try {
    const stored = await getSetting(WALK_KEY);
    return NextResponse.json({ success: true, walk: normalizeWalkSettings(stored) });
  } catch (error) {
    return handleApiError(error, 'GET /api/settings');
  }
}

/** PUT /api/settings — save walk-survey configuration. Auth required. */
export async function PUT(request: NextRequest) {
  try {
    const { userId, response } = await requireSession();
    if (response) return response;

    const body = await request.json();
    const walk = normalizeWalkSettings(body.walk);
    await putSetting(WALK_KEY, walk, userId);
    return NextResponse.json({ success: true, walk });
  } catch (error) {
    return handleApiError(error, 'PUT /api/settings');
  }
}
