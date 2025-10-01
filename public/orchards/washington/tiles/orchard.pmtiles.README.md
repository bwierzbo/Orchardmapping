# PMTiles File Location

Place your `orchard.pmtiles` file in this directory.

The file should contain three vector layers:
- `blocks` - Polygon features for orchard blocks
- `rows` - LineString features for tree rows
- `trees` - Point features for individual trees

## Tree Properties
The tree layer should include these properties:
- `tree_id` - Unique identifier
- `name` - Tree name/label
- `variety` - Tree variety/cultivar
- `status` or `health` - Values: "healthy", "stressed", "dead"
- `planted_date` - Optional planting date
- `row_id` - Parent row ID
- `block_id` - Parent block ID

## Creating PMTiles from GeoJSON

```bash
# Install tippecanoe
brew install tippecanoe

# Convert GeoJSON files to PMTiles
tippecanoe \
  -o orchard.pmtiles \
  -L blocks:blocks.geojson \
  -L rows:rows.geojson \
  -L trees:trees.geojson \
  --maximum-zoom=20 \
  --minimum-zoom=12 \
  --drop-densest-as-needed
```

Once you place the PMTiles file here, the map will automatically load the vector layers on top of your orthomosaic.