import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';

const MAX_PHOTO_BYTES = 15 * 1024 * 1024; // 15 MB — phone camera originals

/**
 * POST /api/photos/upload
 * Client-upload tokens for tree/event photos (browser/phone -> Blob
 * directly). Path convention: photos/<orchard>/<tree_id>/<timestamp>.jpg
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const { response } = await requireSession();
        if (response) {
          throw new Error('Unauthorized');
        }
        if (!pathname.startsWith('photos/') || !/\.(jpe?g|png|webp|heic)$/i.test(pathname)) {
          throw new Error('Invalid upload path');
        }
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
          maximumSizeInBytes: MAX_PHOTO_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // The client attaches the resulting URL to a tree_event via
        // POST /api/trees/[id]/events.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return handleApiError(error, 'POST /api/photos/upload');
  }
}
