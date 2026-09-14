import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { orchardExists, insertOrchardFull } from '@/lib/db/orchards';

/**
 * POST /api/orchards/create-point
 *
 * Creates a minimal "point" orchard around a discovered tree — no
 * drone imagery, just a name and a location. The map renders it on
 * the world satellite base; an orthomosaic can be added later through
 * the normal upload flow. Body: { name, location?, lat, lng }.
 */
export async function POST(request: NextRequest) {
  try {
    const { response } = await requireSession();
    if (response) return response;

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const location = typeof body.location === 'string' ? body.location.trim() : '';
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -85 || lat > 85 || lng < -180 || lng > 180
    ) {
      return NextResponse.json({ error: 'Valid lat/lng are required' }, { status: 400 });
    }

    const orchardId = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!orchardId) {
      return NextResponse.json({ error: 'Name must contain letters or numbers' }, { status: 400 });
    }
    if (await orchardExists(orchardId)) {
      return NextResponse.json(
        { error: `An orchard named "${orchardId}" already exists` },
        { status: 409 }
      );
    }

    // ~150 m box around the point — enough to work in until it's traced
    // or flown; degrees-per-meter narrows with latitude for longitude.
    const dLat = 150 / 111320;
    const dLng = 150 / (111320 * Math.cos((lat * Math.PI) / 180));
    const orchard = await insertOrchardFull({
      id: orchardId,
      name,
      location: location || 'Discovered location',
      description: 'Created from a found tree (no imagery yet)',
      center_lat: lat,
      center_lng: lng,
      bounds_min_lng: lng - dLng,
      bounds_min_lat: lat - dLat,
      bounds_max_lng: lng + dLng,
      bounds_max_lat: lat + dLat,
      default_zoom: 18,
    });

    return NextResponse.json({ success: true, orchardId: orchard.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'POST /api/orchards/create-point');
  }
}
