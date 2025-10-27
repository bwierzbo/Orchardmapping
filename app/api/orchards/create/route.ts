import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { orchardExists, insertOrchard } from '@/lib/db/orchards';
import { PMTiles } from 'pmtiles';
import { promises as fs } from 'fs';
import path from 'path';

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
  try {
    // Check authentication
    const session = await auth();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

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
    const orchardId = name
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

    // Convert File to Buffer
    const arrayBuffer = await pmtilesFile.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    // Create temporary file to validate PMTiles
    const tempDir = path.join(process.cwd(), 'tmp');
    await fs.mkdir(tempDir, { recursive: true });
    const tempFilePath = path.join(tempDir, `temp-${Date.now()}.pmtiles`);

    try {
      await fs.writeFile(tempFilePath, fileBuffer);

      // Validate and extract metadata from PMTiles
      const validation = await validatePMTilesFile(tempFilePath);

      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error || 'Invalid PMTiles file' },
          { status: 400 }
        );
      }

      if (validation.warnings) {
        warnings.push(...validation.warnings);
      }

      if (!validation.metadata) {
        return NextResponse.json(
          { error: 'Could not extract metadata from PMTiles file' },
          { status: 400 }
        );
      }

      const { bounds, center, minZoom, maxZoom, tileType } = validation.metadata;

      // Create the orchard directory structure
      const orchardDir = path.join(process.cwd(), 'public', 'orchards', orchardId, 'tiles');
      await fs.mkdir(orchardDir, { recursive: true });

      // Move file to final location
      const finalPath = path.join(orchardDir, 'orthomap.pmtiles');
      await fs.rename(tempFilePath, finalPath);

      // Insert orchard into database using helper function
      await insertOrchard({
        id: orchardId,
        name,
        location,
        center_lat: center.lat,
        center_lng: center.lng
      });

      // Update orchards.ts configuration file
      await updateOrchardsConfig(orchardId, {
        name,
        location,
        center,
        bounds,
        minZoom,
        maxZoom,
        tileType
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
          fileSizeMB: fileSizeInMB.toFixed(2)
        }
      });

    } finally {
      // Clean up temp file if it still exists
      try {
        await fs.unlink(tempFilePath);
      } catch (e) {
        // Ignore if file doesn't exist
      }
    }

  } catch (error: any) {
    console.error('Error creating orchard:', error);
    return NextResponse.json(
      {
        error: 'Failed to create orchard',
        details: error.message
      },
      { status: 500 }
    );
  }
}

// Validate PMTiles file and extract metadata
async function validatePMTilesFile(filePath: string): Promise<ValidationResult> {
  const warnings: string[] = [];

  try {
    // Create PMTiles instance from file path
    const pmtiles = new PMTiles(`file://${filePath}`);

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

// Update orchards.ts configuration file
async function updateOrchardsConfig(
  orchardId: string,
  config: {
    name: string;
    location: string;
    center: { lng: number; lat: number };
    bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number };
    minZoom: number;
    maxZoom: number;
    tileType: 'raster' | 'vector';
  }
): Promise<void> {
  const orchardsFilePath = path.join(process.cwd(), 'lib', 'orchards.ts');

  // Read the current file
  const fileContent = await fs.readFile(orchardsFilePath, 'utf-8');

  // Find the orchards object definition
  const orchardsMatch = fileContent.match(/export const orchards: Record<string, OrchardConfig> = \{([\s\S]*?)\n\};/);

  if (!orchardsMatch) {
    throw new Error('Could not find orchards object in orchards.ts');
  }

  const defaultZoom = Math.max(17, config.minZoom);

  // Create new orchard configuration
  const newOrchardConfig = `  ${orchardId}: {
    id: '${orchardId}',
    name: '${config.name}',
    location: '${config.location}',
    description: 'Orchard orthomosaic imagery',
    center: [${config.center.lng.toFixed(5)}, ${config.center.lat.toFixed(5)}],
    bounds: {
      minLng: ${config.bounds.minLng.toFixed(8)},
      minLat: ${config.bounds.minLat.toFixed(8)},
      maxLng: ${config.bounds.maxLng.toFixed(8)},
      maxLat: ${config.bounds.maxLat.toFixed(8)}
    },
    defaultZoom: ${defaultZoom},
    minZoom: ${config.minZoom},
    maxZoom: ${config.maxZoom},
    tileMinZoom: ${config.minZoom},
    tileMaxZoom: ${config.maxZoom},
    orthoPath: '',
    orthoPmtilesPath: '/orchards/${orchardId}/tiles/orthomap.pmtiles',
    pmtilesPath: '',
    previewImage: '/orchards/${orchardId}/preview.jpg'
  },`;

  // Insert before the closing brace
  const existingOrchards = orchardsMatch[1];
  const updatedOrchards = existingOrchards + '\n' + newOrchardConfig;

  // Replace the orchards object
  const updatedContent = fileContent.replace(
    /export const orchards: Record<string, OrchardConfig> = \{([\s\S]*?)\n\};/,
    `export const orchards: Record<string, OrchardConfig> = {${updatedOrchards}\n};`
  );

  // Write the updated file
  await fs.writeFile(orchardsFilePath, updatedContent, 'utf-8');
}
