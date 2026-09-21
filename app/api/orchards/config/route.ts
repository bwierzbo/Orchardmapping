import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-errors';
import { getOrchardConfigById, getAllOrchardConfigs } from '@/lib/db/orchards';
import { auth } from '@clerk/nextjs/server';
import { requireOrchardAccess, memberOrchardConfigs } from '@/lib/orchard-access';

// GET /api/orchards/config?id=orchardId - Get single orchard config
// GET /api/orchards/config - Get all orchard configs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const { response: denied } = await requireOrchardAccess(id, 'viewer');
      if (denied) return denied;

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
      // Only the orchards this user belongs to. Listing every orchard in
      // the database was how one signed-in user found everyone else's.
      const { userId } = await auth();
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
      }
      return NextResponse.json(await memberOrchardConfigs(userId));
    }
  } catch (error) {
    return handleApiError(error, 'GET /api/orchards/config');
  }
}
