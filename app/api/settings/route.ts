import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { getSetting, putSetting } from '@/lib/db/app-settings';
import { normalizeWalkSettings } from '@/lib/settings';

const WALK_KEY = 'walk_settings';
const PHOTO_KEY = 'photo_settings';

export interface PhotoSettings {
  /** Show a camera button on the orchard map that drops a geolocated,
   *  draggable photo pin to attach to a tree. */
  geotagOnMap: boolean;
}

function normalizePhotoSettings(stored: unknown): PhotoSettings {
  const s = (stored ?? {}) as Partial<PhotoSettings>;
  return { geotagOnMap: s.geotagOnMap === true };
}

/** GET /api/settings — walk-survey + photo configuration (defaults merged). */
export async function GET() {
  try {
    const [walkStored, photoStored] = await Promise.all([
      getSetting(WALK_KEY),
      getSetting(PHOTO_KEY),
    ]);
    return NextResponse.json({
      success: true,
      walk: normalizeWalkSettings(walkStored),
      photos: normalizePhotoSettings(photoStored),
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/settings');
  }
}

/** PUT /api/settings — save walk and/or photo configuration. Auth required. */
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
    if (body.photos !== undefined) {
      const photos = normalizePhotoSettings(body.photos);
      await putSetting(PHOTO_KEY, photos, userId);
      result.photos = photos;
    }
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'PUT /api/settings');
  }
}
