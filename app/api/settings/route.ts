import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { getSetting, putSetting } from '@/lib/db/app-settings';
import { normalizeWalkSettings } from '@/lib/settings';

const WALK_KEY = 'walk_settings';
/** GET /api/settings — walk-survey configuration (defaults merged). */
export async function GET() {
  try {
    const walkStored = await getSetting(WALK_KEY);
    return NextResponse.json({
      success: true,
      walk: normalizeWalkSettings(walkStored),
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/settings');
  }
}

/** PUT /api/settings — save walk configuration. Auth required. */
export async function PUT(request: NextRequest) {
  try {
    const { userId, response } = await requireSession();
    if (response) return response;

    const body = await request.json();
    const result: Record<string, unknown> = { success: true };
    if (body.walk !== undefined) {
      const walk = normalizeWalkSettings(body.walk);
      await putSetting(WALK_KEY, walk, userId);
      result.walk = walk;
    }
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'PUT /api/settings');
  }
}
