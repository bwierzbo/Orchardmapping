import { PMTiles } from 'pmtiles';

export async function validatePMTiles(url: string): Promise<{
  valid: boolean;
  error?: string;
  metadata?: any;
}> {
  try {
    const pmtiles = new PMTiles(url);

    // Try to get the header
    const header = await pmtiles.getHeader();
    console.log('PMTiles header:', header);

    // Try to get metadata
    const metadata: any = await pmtiles.getMetadata();
    console.log('PMTiles metadata:', metadata);

    // Check if it has vector layers
    if (metadata?.vector_layers) {
      console.log('Vector layers found:', metadata.vector_layers);
      const foundLayers = metadata.vector_layers.map((l: any) => l.id);
      console.log('Available layers:', foundLayers);

      // Check if we have at least a trees layer or default layer
      if (!foundLayers.includes('trees') && !foundLayers.includes('default') && foundLayers.length === 0) {
        console.warn('No tree layer found in PMTiles');
      }
    } else {
      console.log('PMTiles metadata does not specify vector_layers - assuming default layer');
    }

    return {
      valid: true,
      metadata
    };
  } catch (error: any) {
    console.error('PMTiles validation error:', error);
    return {
      valid: false,
      error: error.message || 'Failed to load PMTiles file'
    };
  }
}

// Helper to safely load PMTiles with fallback
export async function loadPMTilesSafely(url: string): Promise<PMTiles | null> {
  try {
    const validation = await validatePMTiles(url);

    if (!validation.valid) {
      console.error('PMTiles validation failed:', validation.error);
      return null;
    }

    return new PMTiles(url);
  } catch (error) {
    console.error('Failed to load PMTiles:', error);
    return null;
  }
}