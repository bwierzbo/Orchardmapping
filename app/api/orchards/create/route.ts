import { NextRequest, NextResponse } from 'next/server';
import { requireSession, WRITER_ROLES } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { orchardExists, insertOrchardFull } from '@/lib/db/orchards';
import { uploadPMTilesToBlob, deleteOrchardBlobs } from '@/lib/blob/upload';
import { PMTiles } from 'pmtiles';

interface PMTilesHeader {
  minZoom: number;
  maxZoom: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  centerZoom: number;
  centerLon: number;
  centerLat: number;
  tileType: number; // 1 = raster (PNG/JPG), 2 = vector (MVT)
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  metadata?: {
    bounds: {
      minLng: number;
      minLat: number;
      maxLng: number;
      maxLat: number;
    };
    center: {
      lng: number;
      lat: number;
    };
    minZoom: number;
    maxZoom: number;
    tileType: 'raster' | 'vector';
  };
}

// POST /api/orchards/create - Create a new orchard with PMTiles upload
export async function POST(request: NextRequest) {
  let uploadedBlobUrl: string | null = null;
  let orchardId: string | null = null;

  try {
    const { response } = await requireSession(WRITER_ROLES);
    if (response) return response;

    // Parse the multipart form data
    const formData = await request.formData();

    const name = formData.get('name') as string;
    const location = formData.get('location') as string;
    const pmtilesFile = formData.get('pmtilesFile') as File;

    // Validate required fields
    if (!name || !location || !pmtilesFile) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          details: {
            name: !name ? 'Name is required' : null,
            location: !location ? 'Location is required' : null,
            pmtilesFile: !pmtilesFile ? 'PMTiles file is required' : null,
          }
        },
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

    // Check if orchard ID already exists in database
    const exists = await orchardExists(orchardId);

    if (exists) {
      return NextResponse.json(
        {
          error: 'Orchard already exists',
          details: `An orchard with ID "${orchardId}" already exists. Please use a different name.`
        },
        { status: 409 }
      );
    }

    // Validate file extension
    if (!pmtilesFile.name.toLowerCase().endsWith('.pmtiles')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload a .pmtiles file.' },
        { status: 400 }
      );
    }

    // Check file size
    const fileSizeInMB = pmtilesFile.size / (1024 * 1024);
    const warnings: string[] = [];

    if (fileSizeInMB > 2048) {
      return NextResponse.json(
        {
          error: 'File too large',
          details: `File size is ${fileSizeInMB.toFixed(2)}MB. Maximum allowed size is 2GB.`
        },
        { status: 413 }
      );
    }

    if (fileSizeInMB > 500) {
      warnings.push(`Large file detected (${fileSizeInMB.toFixed(2)}MB). Upload may take some time.`);
    }

    // Convert File to Buffer for upload
    const arrayBuffer = await pmtilesFile.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Upload to Vercel Blob
    const blobResult = await uploadPMTilesToBlob(
      orchardId,
      fileBuffer,
      'orthomap.pmtiles',
      'ortho'
    );
    uploadedBlobUrl = blobResult.url;

    // Validate PMTiles from the Blob URL
    const validation = await validatePMTilesFromUrl(blobResult.url);

    if (!validation.valid) {
      // Clean up the uploaded blob if validation fails
      await deleteOrchardBlobs(orchardId);
      return NextResponse.json(
        { error: validation.error || 'Invalid PMTiles file' },
        { status: 400 }
      );
    }

    if (validation.warnings) {
      warnings.push(...validation.warnings);
    }

    if (!validation.metadata) {
      await deleteOrchardBlobs(orchardId);
      return NextResponse.json(
        { error: 'Could not extract metadata from PMTiles file' },
        { status: 400 }
      );
    }

    const { bounds, center, minZoom, maxZoom, tileType } = validation.metadata;
    const defaultZoom = Math.max(17, minZoom);

    // Insert orchard with full configuration into database
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
      tile_min_zoom: minZoom,
      tile_max_zoom: Math.min(maxZoom, 23),
      ortho_pmtiles_url: blobResult.url,
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
        fileSizeMB: fileSizeInMB.toFixed(2),
        blobUrl: blobResult.url,
      }
    });

  } catch (error) {
    // Clean up blob on error if it was uploaded
    if (uploadedBlobUrl && orchardId) {
      try {
        await deleteOrchardBlobs(orchardId);
      } catch (cleanupError) {
        console.error('Error cleaning up blob:', cleanupError);
      }
    }

    return handleApiError(error, 'POST /api/orchards/create');
  }
}

// Validate PMTiles from a URL and extract metadata
async function validatePMTilesFromUrl(url: string): Promise<ValidationResult> {
  const warnings: string[] = [];

  try {
    // Create PMTiles instance from URL
    const pmtiles = new PMTiles(url);

    // Get header
    const header = await pmtiles.getHeader() as unknown as PMTilesHeader;

    if (!header) {
      return {
        valid: false,
        error: 'Could not read PMTiles header'
      };
    }

    // Validate tile type
    let tileType: 'raster' | 'vector';
    if (header.tileType === 1) {
      tileType = 'raster';
    } else if (header.tileType === 2) {
      tileType = 'vector';
      warnings.push('Vector PMTiles detected. This endpoint is optimized for raster/imagery tiles.');
    } else {
      return {
        valid: false,
        error: `Unsupported tile type: ${header.tileType}. Expected raster (1) or vector (2).`
      };
    }

    // Validate bounds
    if (
      header.minLon === undefined ||
      header.minLat === undefined ||
      header.maxLon === undefined ||
      header.maxLat === undefined
    ) {
      return {
        valid: false,
        error: 'PMTiles file does not contain valid geographic bounds'
      };
    }

    // Check for world bounds (likely invalid for orchard mapping)
    if (
      header.minLon <= -180 &&
      header.maxLon >= 180 &&
      header.minLat <= -85 &&
      header.maxLat >= 85
    ) {
      warnings.push('PMTiles appears to have world bounds. This may indicate incorrect georeferencing.');
    }

    // Calculate center if not present
    const centerLng = header.centerLon ?? (header.minLon + header.maxLon) / 2;
    const centerLat = header.centerLat ?? (header.minLat + header.maxLat) / 2;

    // Cap max zoom to 21.5 to prevent map issues
    const maxZoom = Math.min(header.maxZoom, 21.5);
    if (header.maxZoom > 21.5) {
      warnings.push(`Max zoom capped at 21.5 (was ${header.maxZoom}) to prevent map rendering issues.`);
    }

    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      metadata: {
        bounds: {
          minLng: header.minLon,
          minLat: header.minLat,
          maxLng: header.maxLon,
          maxLat: header.maxLat
        },
        center: {
          lng: centerLng,
          lat: centerLat
        },
        minZoom: header.minZoom,
        maxZoom,
        tileType
      }
    };

  } catch (error: any) {
    console.error('PMTiles validation error:', error);
    return {
      valid: false,
      error: `Failed to validate PMTiles: ${error.message}`
    };
  }
}
