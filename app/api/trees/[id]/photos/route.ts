import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { removeTreePhoto } from '@/lib/db/tree-events';
import { assertTreeAccess } from '@/lib/orchard-access';

/**
 * DELETE /api/trees/[id]/photos  { url }
 * Take a photo off a tree: a picture of the wrong tree, or a blurred one.
 * Keyed by url because that is what the photo series shows -- one picture,
 * however many events it rode on.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, response } = await requireSession();
    if (response) return response;

    const { id: tree_id } = await params;
    const denied = await assertTreeAccess(tree_id, userId, 'operator');
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    await removeTreePhoto(tree_id, url);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'DELETE /api/trees/[id]/photos');
  }
}
