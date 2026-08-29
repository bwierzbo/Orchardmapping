import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-errors';
import { getOrchardConfigById, getAllOrchardConfigs } from '@/lib/db/orchards';

// GET /api/orchards/config?id=orchardId - Get single orchard config
// GET /api/orchards/config - Get all orchard configs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      // Fetch single orchard
      const orchard = await getOrchardConfigById(id);

      if (!orchard) {
        return NextResponse.json(
          { error: 'Orchard not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(orchard);
    } else {
      // Fetch all orchards
      const orchards = await getAllOrchardConfigs();
      return NextResponse.json(orchards);
    }
  } catch (error) {
    return handleApiError(error, 'GET /api/orchards/config');
  }
}
