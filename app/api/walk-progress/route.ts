import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { getSetting, putSetting } from '@/lib/db/app-settings';
import { normalizeWalkProgress } from '@/lib/walk-progress';
import { sql } from '@vercel/postgres';

/**
 * Server copy of an in-progress walk survey, one per orchard, so a walk
 * paused on one device can be resumed on another. Stored in app_settings
 * under walk_progress:<orchard>. The browser keeps its own copy too;
 * the client reconciles by updatedAt.
 */
const key = (orchardId: string) => `walk_progress:${orchardId}`;

function orchardParam(request: NextRequest): string | null {
  const id = new URL(request.url).searchParams.get('orchard');
  return id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

/** GET /api/walk-progress?orchard=<id> — the saved walk, or null. */
export async function GET(request: NextRequest) {
  try {
    const { response } = await requireSession();
    if (response) return response;
    const orchardId = orchardParam(request);
    if (!orchardId) return NextResponse.json({ error: 'orchard is required' }, { status: 400 });
    const progress = normalizeWalkProgress(await getSetting(key(orchardId)));
    return NextResponse.json({ progress: progress?.orchardId === orchardId ? progress : null });
  } catch (error) {
    return handleApiError(error, 'GET /api/walk-progress');
  }
}

/** PUT /api/walk-progress — save (replace) the walk for its orchard. */
export async function PUT(request: NextRequest) {
  try {
    const { userId, response } = await requireSession();
    if (response) return response;
    const progress = normalizeWalkProgress(await request.json());
    if (!progress) return NextResponse.json({ error: 'Invalid walk progress' }, { status: 400 });
    await putSetting(key(progress.orchardId), progress, userId);
    return NextResponse.json({ progress });
  } catch (error) {
    return handleApiError(error, 'PUT /api/walk-progress');
  }
}

/** DELETE /api/walk-progress?orchard=<id> — the walk finished or was discarded. */
export async function DELETE(request: NextRequest) {
  try {
    const { response } = await requireSession();
    if (response) return response;
    const orchardId = orchardParam(request);
    if (!orchardId) return NextResponse.json({ error: 'orchard is required' }, { status: 400 });
    await sql`DELETE FROM app_settings WHERE key = ${key(orchardId)}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'DELETE /api/walk-progress');
  }
}
