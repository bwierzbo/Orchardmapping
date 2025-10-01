# PMTiles Troubleshooting Guide

## Current Issue: "Unimplemented type: 7" Error

### Problem
When loading the PMTiles file `orthomap.pmtiles`, the map encounters a parsing error:
```
Unable to parse tile: Unimplemented type: 7
```

This error indicates that the PMTiles file contains geometry types that aren't supported by the MVT (Mapbox Vector Tiles) specification. Valid MVT geometry types are:
- Type 1: Point
- Type 2: LineString
- Type 3: Polygon

Type 7 doesn't exist in the MVT spec, suggesting the file may be:
1. Corrupted
2. Created with incompatible settings
3. Using a different format than expected

### Current Solution

We've implemented robust error handling to prevent the PMTiles parsing error from breaking the map:

1. **Validation before loading**: The `pmtiles-utils.ts` module validates PMTiles files before attempting to use them
2. **Graceful fallback**: If validation fails, the map continues working with just the orthomosaic layer
3. **Error isolation**: Map errors are caught and logged without interrupting the user experience
4. **Conditional rendering**: Vector layers are only added if PMTiles validation passes

### How to Fix the PMTiles File

To create a compatible PMTiles file, follow these steps:

1. **Prepare your GeoJSON files**:
   - `blocks.geojson` - Polygon features for orchard blocks
   - `rows.geojson` - LineString features for tree rows
   - `trees.geojson` - Point features for individual trees

2. **Install tippecanoe**:
   ```bash
   brew install tippecanoe
   ```

3. **Create PMTiles with correct settings**:
   ```bash
   tippecanoe \
     -o orthomap.pmtiles \
     -L blocks:blocks.geojson \
     -L rows:rows.geojson \
     -L trees:trees.geojson \
     --maximum-zoom=22 \
     --minimum-zoom=5 \
     --drop-densest-as-needed \
     --no-feature-limit \
     --no-tile-size-limit
   ```

4. **Verify the file**:
   ```bash
   # Install pmtiles CLI
   npm install -g pmtiles

   # Check file info
   pmtiles show orthomap.pmtiles
   ```

### Re-enabling PMTiles

Once you have a valid PMTiles file:

1. Place it in `/public/orchards/washington/tiles/orthomap.pmtiles`
2. Update `/lib/orchards.ts`:
   ```typescript
   pmtilesPath: '/orchards/washington/tiles/orthomap.pmtiles',
   ```

The map will automatically validate and load the PMTiles if they're in the correct format.

### Testing PMTiles

Open the browser console while loading the map to see validation messages:
- `PMTiles validation successful` - File loaded correctly
- `Available vector layers: [...]` - Shows which layers were found
- `PMTiles validation failed` - File has issues

### Alternative: Mock Vector Data

For development/testing without real PMTiles, you can:
1. Keep PMTiles disabled (`pmtilesPath: ''`)
2. Use static GeoJSON overlays instead
3. Wait for proper PMTiles generation from your orthomosaic processing pipeline