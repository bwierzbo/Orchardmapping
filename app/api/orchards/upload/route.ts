import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireSession, WRITER_ROLES } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';

const MAX_PMTILES_BYTES = 1024 * 1024 * 1024; // 1 GB

/**
 * POST /api/orchards/upload
 * Issues client-upload tokens so PMTiles files go browser -> Blob
 * directly, bypassing serverless request-body limits entirely.
 * Requires operator/admin.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const { response } = await requireSession(WRITER_ROLES);
        if (response) {
          throw new Error('Unauthorized');
        }
        if (!pathname.startsWith('orchards/') || !pathname.endsWith('.pmtiles')) {
          throw new Error('Invalid upload path');
        }
        return {
          allowedContentTypes: ['application/octet-stream', 'application/vnd.pmtiles'],
          maximumSizeInBytes: MAX_PMTILES_BYTES,
          addRandomSuffix: false,
        };
      },
      onUploadCompleted: async () => {
        // Orchard row creation happens via POST /api/orchards/create
        // after the client finishes uploading.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return handleApiError(error, 'POST /api/orchards/upload');
  }
}
