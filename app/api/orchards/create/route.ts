import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { orchardExists, insertOrchardFull } from '@/lib/db/orchards';
import { deleteOrchardBlobs } from '@/lib/blob/upload';
import { validatePMTilesFromUrl } from '@/lib/pmtiles/validate';

/**
 * POST /api/orchards/create
 *
 * Creates an orchard from an already-uploaded PMTiles Blob. The file
 * itself goes browser -> Blob via /api/orchards/upload (client upload),
 * so this route only receives JSON metadata:
 *   { name: string, location: string, blobUrl: string }
 *
 * Requires operator/admin.
 */
export async function POST(request: NextRequest) {
  let orchardId: string | null = null;

  try {
    const { response } = await requireSession();
    if (response) return response;

    const body = await request.json();
    const { name, location, blobUrl } = body as {
      name?: string;
      location?: string;
      blobUrl?: string;
    };

    if (!name || !location || !blobUrl) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          details: {
            name: !name ? 'Name is required' : null,
            location: !location ? 'Location is required' : null,
            blobUrl: !blobUrl ? 'blobUrl is required' : null,
          },
        },
        { status: 400 }
      );
    }

    // Only accept URLs from Vercel Blob storage, under the orchards/ prefix
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(blobUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid blobUrl' }, { status: 400 });
    }
    if (
      !parsedUrl.hostname.endsWith('.public.blob.vercel-storage.com') ||
      !parsedUrl.pathname.startsWith('/orchards/') ||
      !parsedUrl.pathname.endsWith('.pmtiles')
    ) {
      return NextResponse.json(
        { error: 'blobUrl must be an orchards/ PMTiles file in Blob storage' },
        { status: 400 }
      );
    }

    // Generate orchard ID from name
    orchardId = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!orchardId) {
      return NextResponse.json(
        { error: 'Invalid orchard name. Please use alphanumeric characters.' },
        { status: 400 }
      );
    }

    const exists = await orchardExists(orchardId);
    if (exists) {
      return NextResponse.json(
        {
          error: 'Orchard already exists',
          details: `An orchard with ID "${orchardId}" already exists. Please use a different name.`,
        },
        { status: 409 }
      );
    }

    // Validate the uploaded PMTiles (header-only, via range requests)
    const validation = await validatePMTilesFromUrl(blobUrl);
    const warnings: string[] = [];

    if (!validation.valid || !validation.metadata) {
      return NextResponse.json(
        { error: validation.error || 'Could not extract metadata from PMTiles file' },
        { status: 400 }
      );
    }
    if (validation.warnings) {
      warnings.push(...validation.warnings);
    }

    const { bounds, center, minZoom, maxZoom, tileMaxZoom, tileType } = validation.metadata;
    const defaultZoom = Math.max(17, minZoom);

    await insertOrchardFull({
      id: orchardId,
      name,
      location,
      description: 'Orchard orthomosaic imagery',
      center_lat: center.lat,
      center_lng: center.lng,
      bounds_min_lng: bounds.minLng,
      bounds_min_lat: bounds.minLat,
      bounds_max_lng: bounds.maxLng,
      bounds_max_lat: bounds.maxLat,
      default_zoom: defaultZoom,
      min_zoom: minZoom,
      max_zoom: maxZoom,
      // INTEGER columns: round, never send fractional zooms
      tile_min_zoom: Math.round(minZoom),
      tile_max_zoom: Math.min(tileMaxZoom, 23),
      ortho_pmtiles_url: blobUrl,
    });

    return NextResponse.json({
      success: true,
      orchardId,
      message: `Orchard "${name}" created successfully`,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        bounds,
        center,
        minZoom,
        maxZoom,
        tileType,
        blobUrl,
      },
    });
  } catch (error) {
    // Best-effort cleanup of the uploaded blob if the insert failed
    if (orchardId) {
      try {
        await deleteOrchardBlobs(orchardId);
      } catch (cleanupError) {
        console.error('Error cleaning up blob:', cleanupError);
      }
    }

    return handleApiError(error, 'POST /api/orchards/create');
  }
}
