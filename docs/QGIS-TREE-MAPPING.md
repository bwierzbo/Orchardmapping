# QGIS Tree Mapping Guide

This guide explains how to use QGIS to create and manage tree point data for your orchard mapping system.

## Overview

QGIS is a free, open-source GIS application that lets you:
- Digitize tree locations on your orthophoto
- Add attributes (variety, health status, etc.)
- Export to formats compatible with your mapping system

## Prerequisites

1. **Install QGIS**: Download from https://qgis.org/download/
2. **Your orthomosaic file**: The georeferenced orthophoto (GeoTIFF or mbtiles)
3. **Orchard coordinates**: From `lib/orchards.ts` (e.g., Many Trees: 48.14192, -123.16743)

## Method 1: Digitize Trees in QGIS

### Step 1: Load Your Orthomosaic

1. Open QGIS
2. **Add Raster Layer**:
   - If you have a GeoTIFF: `Layer > Add Layer > Add Raster Layer`
   - If you have mbtiles: `Layer > Add Layer > Add Vector Tile Layer` (use `public/orchards/manytreesorchard/manytrees.mbtiles`)

### Step 2: Create New Point Layer

1. `Layer > Create Layer > New GeoPackage Layer` or `New Shapefile Layer`
2. Configure:
   - **File name**: `manytrees_trees.gpkg` (or `.shp`)
   - **Geometry type**: Point
   - **CRS**: EPSG:4326 (WGS 84) - same as your map
3. **Add Fields** (click "New Field" for each):
   - `tree_id` (Text, width 50) - REQUIRED, unique ID like "MT-A-01-001"
   - `name` (Text, width 100) - Tree name/label
   - `variety` (Text, width 100) - Apple variety, etc.
   - `status` (Text, width 50) - "healthy", "stressed", "dead"
   - `block_id` (Text, width 50) - Block identifier
   - `row_id` (Text, width 50) - Row identifier
   - `position` (Integer) - Position in row
   - `notes` (Text, width 255) - Any notes

### Step 3: Digitize Trees

1. Select your new layer in the Layers panel
2. Click **Toggle Editing** (pencil icon)
3. Click **Add Point Feature** (point icon)
4. Click on each tree location on the orthomosaic
5. Fill in the attribute form:
   - **tree_id**: Use consistent naming like "MT-A-01-001" (ManYTrees-Block-Row-Position)
   - **name**: "Tree 1" or descriptive name
   - **variety**: "Honeycrisp", "Gala", etc.
   - **status**: "healthy", "stressed", or "dead"
6. Repeat for all trees
7. **Save Edits** (click save icon)
8. **Toggle Editing** off when done

### Step 4: Export to CSV

1. Right-click your tree layer > `Export > Save Features As...`
2. Configure:
   - **Format**: Comma Separated Value [CSV]
   - **File name**: `manytrees_trees.csv`
   - **CRS**: EPSG:4326
   - **Geometry**: AS_XY (this adds lat/lon columns)
   - **Layer Options**:
     - GEOMETRY: AS_XY
     - CREATE_CSVT: YES
3. Click **OK**

### Step 5: Convert CSV to Import Format

Your CSV will look like:
```csv
tree_id,name,variety,status,block_id,row_id,position,notes,X,Y
MT-A-01-001,Tree 1,Honeycrisp,healthy,A,01,1,Good tree,-123.16743,48.14192
```

Create a script or manually convert to the import JSON format:

```json
{
  "orchard": "manytrees",
  "trees": [
    {
      "tree_id": "MT-A-01-001",
      "name": "Tree 1",
      "variety": "Honeycrisp",
      "status": "healthy",
      "block_id": "A",
      "row_id": "01",
      "position": 1,
      "lng": -123.16743,
      "lat": 48.14192,
      "notes": "Good tree"
    }
  ]
}
```

### Step 6: Import to Database

```bash
# Save the JSON file
# Then import:
npx tsx scripts/import-trees.ts scripts/manytrees_trees.json
```

## Method 2: Use Existing CSV

If you already have tree data in a spreadsheet:

1. Export to CSV with columns: `tree_id,name,variety,status,lat,lng,block_id,row_id,position,notes`
2. Import directly:

```bash
npx tsx scripts/import-trees-csv.ts path/to/trees.csv manytrees
```

## Method 3: Connect QGIS to Neon Database (Advanced)

You can connect QGIS directly to your Neon Postgres database:

1. In QGIS: `Layer > Add Layer > Add PostgreSQL Layer`
2. Click **New** to create a connection:
   - **Name**: Orchard Map Neon
   - **Host**: `ep-holy-bread-a4x8gs6t-pooler.us-east-1.aws.neon.tech`
   - **Port**: 5432
   - **Database**: verceldb
   - **Username**: default
   - **Password**: [from your .env.local]
   - **SSL Mode**: require
3. Click **Test Connection**
4. If successful, click **OK**
5. Select the connection and click **Connect**
6. Check the `trees` table and click **Add**

Now you can:
- View trees on the map
- Edit attributes directly
- Changes sync to your database

## Tips

### Tree Naming Convention
Use a consistent pattern like:
- `MT-A-01-001`: ManYTrees-Block A-Row 01-Position 001
- `MT-B-02-015`: ManYTrees-Block B-Row 02-Position 015

### Status Values
Use exactly these values for proper color coding:
- `healthy` → Green on map
- `stressed` → Yellow on map
- `dead` → Red on map
- `unknown` → Gray on map

### Styling in QGIS
To preview how trees will look on your map:
1. Right-click layer > `Properties > Symbology`
2. Choose **Categorized**
3. Column: `status`
4. Click **Classify**
5. Match colors to your map:
   - healthy: Green (#2ecc71)
   - stressed: Yellow (#f39c12)
   - dead: Red (#e74c3c)

## Export Options

### For Web Map (GeoJSON)
```
Format: GeoJSON
CRS: EPSG:4326
```

### For Analysis (GeoPackage)
```
Format: GeoPackage
CRS: EPSG:4326
```

### For Database Import (CSV)
```
Format: CSV
Geometry: AS_XY
```

## Troubleshooting

**Q: Trees appear in wrong location?**
- Check CRS is EPSG:4326 (WGS 84)
- Verify lat/lng aren't swapped (lat should be ~48, lng should be ~-123 for Washington)

**Q: Import fails?**
- Ensure `tree_id` is unique for each tree
- Check required fields are filled
- Verify CSV encoding is UTF-8

**Q: Can't see orthomosaic in QGIS?**
- Make sure the file is georeferenced
- Check if mbtiles format is supported (may need plugin)
- Try exporting from mbtiles to GeoTIFF first

## Next Steps

After importing trees:
1. Visit your map at http://localhost:3000
2. Select Many Trees orchard
3. Click on tree points to see data
4. Use "Edit" button to update tree information
5. All changes save to the Neon database
