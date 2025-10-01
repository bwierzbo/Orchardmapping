# PMTiles Directory

Place your `orchard.pmtiles` file in this directory.

## File Structure
```
public/tiles/
└── orchard.pmtiles
```

## Expected Layers in orchard.pmtiles

The PMTiles file should contain three vector layers:

### 1. `blocks` (Polygons)
- Orchard blocks/sections
- Properties:
  - `block_id` (string): Unique block identifier
  - `area` (number): Block area in hectares
  - `variety` (string): Primary variety in block

### 2. `rows` (LineStrings)
- Tree rows within blocks
- Properties:
  - `row_id` (string): Unique row identifier
  - `block_id` (string): Parent block ID
  - `length` (number): Row length in meters

### 3. `trees` (Points)
- Individual tree locations
- Properties:
  - `tree_id` (string): Unique tree identifier
  - `variety` (string): Tree variety/cultivar
  - `health` (string): "healthy", "stressed", or "dead"
  - `planted_date` (string): Planting date
  - `row_id` (string): Parent row ID
  - `block_id` (string): Parent block ID

## Creating PMTiles

### From GeoJSON:
```bash
# Install tippecanoe
brew install tippecanoe

# Convert GeoJSON to PMTiles
tippecanoe \
  -o orchard.pmtiles \
  -L blocks:blocks.geojson \
  -L rows:rows.geojson \
  -L trees:trees.geojson \
  --maximum-zoom=20 \
  --minimum-zoom=12 \
  --drop-densest-as-needed
```

### From Shapefile:
```bash
# Convert to GeoJSON first
ogr2ogr -f GeoJSON blocks.geojson blocks.shp
ogr2ogr -f GeoJSON rows.geojson rows.shp
ogr2ogr -f GeoJSON trees.geojson trees.shp

# Then use tippecanoe as above
```

### From PostGIS:
```bash
# Export to GeoJSON
ogr2ogr -f GeoJSON blocks.geojson \
  "PG:host=localhost dbname=orchard user=postgres" \
  -sql "SELECT * FROM blocks"

# Then convert to PMTiles
```

## Styling

The map applies the following default styles:

- **Blocks**: Light transparent cyan fill with darker outline
- **Rows**: Thin dark lines that get thicker at higher zoom
- **Trees**: Color-coded circles based on health status
  - Green (#2ecc71): Healthy
  - Orange (#f39c12): Stressed
  - Red (#e74c3c): Dead
  - Gray (#95a5a6): Unknown

## Testing

1. Place `orchard.pmtiles` in this directory
2. Start the dev server: `npm run dev`
3. Navigate to `/orchard`
4. Vector layers should appear on top of the orthomosaic
5. Click on trees to see popup information
6. Trees appear at zoom level 15+
7. Tree labels appear at zoom level 18+