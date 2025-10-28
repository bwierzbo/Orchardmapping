import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { Database } from 'sqlite3';

// Map of orchard IDs to their mbtiles files
const MBTILES_PATHS: Record<string, string> = {
  manytrees: path.join(process.cwd(), 'public/orchards/manytreesorchard/manytrees.mbtiles'),
  washington: path.join(process.cwd(), 'public/orchards/washington/tiles/orthomap.mbtiles'),
};

// GET /api/tiles/[orchard]/[z]/[x]/[y]
// Serves tiles from mbtiles with Y-coordinate flip to fix hemisphere issue
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orchard: string; z: string; x: string; y: string }> }
) {
  try {
    const { orchard, z, x, y } = await params;
    const mbtilesPath = MBTILES_PATHS[orchard];

    if (!mbtilesPath) {
      return new NextResponse(`Orchard '${orchard}' not found`, { status: 404 });
    }

    const zoom = parseInt(z);
    const tileX = parseInt(x);
    const tileY = parseInt(y);

    // NOTE: This mbtiles appears to already use XYZ format, not TMS
    // Try without Y-flip first
    const tmsY = tileY; // No flip needed if already in XYZ format

    // Query mbtiles database using promise wrapper
    const tileData = await new Promise<Buffer | null>((resolve, reject) => {
      const db = new Database(mbtilesPath, (err) => {
        if (err) {
          reject(err);
          return;
        }

        db.get(
          'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?',
          [zoom, tileX, tmsY],
          (err: Error | null, row: any) => {
            db.close();

            if (err) {
              reject(err);
            } else if (!row || !row.tile_data) {
              resolve(null);
            } else {
              resolve(row.tile_data as Buffer);
            }
          }
        );
      });
    });

    if (!tileData) {
      return new NextResponse(`Tile not found: ${zoom}/${tileX}/${tileY} (TMS: ${tmsY})`, { status: 404 });
    }

    // Determine content type based on tile data
    let contentType = 'application/octet-stream';

    if (tileData[0] === 0x89 && tileData[1] === 0x50) {
      contentType = 'image/png';
    } else if (tileData[0] === 0xFF && tileData[1] === 0xD8) {
      contentType = 'image/jpeg';
    } else if (tileData[0] === 0x52 && tileData[1] === 0x49) {
      contentType = 'image/webp';
    }

    // Convert Buffer to Uint8Array for NextResponse compatibility
    const arrayBuffer = new Uint8Array(tileData).buffer;

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error('Error serving tile:', error);
    return new NextResponse(error.message || 'Internal server error', { status: 500 });
  }
}
