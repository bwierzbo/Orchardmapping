# How to Regenerate PMTiles to Show All Trees at All Zoom Levels

## The Problem
Currently, trees only appear as you zoom in because the PMTiles file was generated with zoom-dependent feature dropping. This is tippecanoe's default behavior to optimize file size.

## Solution: Regenerate with All Features Preserved

### Step 1: Install tippecanoe (if not already installed)
```bash
brew install tippecanoe
```

### Step 2: Regenerate the PMTiles file with proper settings

```bash
tippecanoe \
  -o trees.pmtiles \
  --force \
  --no-feature-limit \
  --no-tile-size-limit \
  --drop-rate=0 \
  --cluster-distance=0 \
  --minimum-zoom=10 \
  --maximum-zoom=20 \
  --base-zoom=15 \
  --no-simplification-of-shared-nodes \
  --detect-shared-borders \
  --layer=trees \
  trees.geojson
```

### Important Parameters Explained:
- `--no-feature-limit`: Don't limit features per tile
- `--no-tile-size-limit`: Don't drop features to reduce tile size
- `--drop-rate=0`: Never drop features
- `--cluster-distance=0`: Don't cluster points
- `--minimum-zoom=10`: Start tiles at zoom 10
- `--maximum-zoom=20`: Generate tiles up to zoom 20
- `--base-zoom=15`: The zoom level where all features should be present
- `--no-simplification-of-shared-nodes`: Preserve exact geometry

### Alternative: Use Different Settings for Different Zoom Ranges

If file size is a concern, you can be more selective:

```bash
tippecanoe \
  -o trees.pmtiles \
  --force \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  --minimum-zoom=12 \
  --maximum-zoom=22 \
  --base-zoom=17 \
  --full-detail=17 \
  --low-detail=12 \
  --layer=trees \
  -j '{"tippecanoe": {"minzoom": 12, "maxzoom": 22}}' \
  trees.geojson
```

### Step 3: Replace the PMTiles file
```bash
mv trees.pmtiles /Users/benjaminwierzbanowski/Code/orchard-map/public/orchards/washington/tiles/
```

## Verifying the Fix

After regenerating, all 67 trees should be visible at all zoom levels (from zoom 10+). The trees will appear smaller at lower zoom levels and larger as you zoom in, but they'll all be present.

## Current Workaround

Without regenerating the file, trees will continue to appear progressively as you zoom in. This is a limitation of how the current PMTiles file was generated, not a bug in the code.