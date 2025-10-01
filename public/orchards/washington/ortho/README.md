# Orthomosaic Tiles Directory

Place your orthomosaic XYZ tiles in this directory following the structure:

```
public/ortho/
├── 12/
│   ├── 1234/
│   │   ├── 5678.png
│   │   └── 5679.png
│   └── 1235/
│       ├── 5678.png
│       └── 5679.png
├── 13/
│   └── ...
├── 14/
│   └── ...
└── ... (continue for zoom levels up to 20)
```

## Tile Structure
- `{z}` = zoom level (12-20)
- `{x}` = tile column
- `{y}` = tile row
- Format: PNG (256x256 pixels)

## Generating Tiles

You can generate tiles from your orthomosaic using tools like:

1. **GDAL (gdal2tiles.py)**:
```bash
gdal2tiles.py -p mercator -z 12-20 -w none orthomosaic.tif public/ortho/
```

2. **QGIS**: Use the "Generate XYZ Tiles" processing tool

3. **TileMill/MapProxy**: For more advanced tiling options

## Testing
The tiles will be served at: `http://localhost:3000/ortho/{z}/{x}/{y}.png`

## Notes
- Tiles are served directly from Next.js without needing a separate tile server
- The map expects 256x256px tiles by default
- Adjust the bounds in page.tsx to match your orchard location