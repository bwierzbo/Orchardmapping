# Minimal QGIS Workflow for Tree Mapping

This is the fastest way to get tree locations into your orchard map.

## Quick Start (5 minutes)

### 1. QGIS Setup (Bare Minimum)

In QGIS, create a point layer with **only one field**:

```
Field Name: tree_id
Type: Text
Width: 50
```

That's it! No other fields needed to start.

### 2. Click Trees

1. Toggle Editing mode
2. Click on each tree in your orthomosaic
3. Enter a unique ID for each tree:
   - `MT-001`, `MT-002`, `MT-003`, etc.
   - Or use detailed format: `MT-A-01-001` (Block-Row-Position)
4. Save edits

### 3. Export CSV

Right-click layer → Export → Save Features As:
- **Format**: CSV
- **Geometry**: AS_XY (important!)
- **Filename**: `trees.csv`

Your CSV will look like:
```csv
tree_id,X,Y
MT-001,-123.16743,48.14192
MT-002,-123.16740,48.14195
MT-003,-123.16738,48.14198
```

### 4. Import to Database

```bash
npx tsx scripts/import-trees-csv.ts manytrees trees.csv
```

Done! Your trees are now on the map at http://localhost:3000

---

## Add More Info Later

You have **3 ways** to add details to trees:

### Option 1: Via Web Map (Easiest)

1. Visit http://localhost:3000
2. Select Many Trees orchard
3. Click any tree
4. Click "Edit" button
5. Add variety, status, notes, etc.
6. Click "Save"

Changes save to database instantly!

### Option 2: Re-import with More Columns

Add columns to your QGIS layer:
```
tree_id (required)
name
variety
status
block_id
row_id
```

Export again and re-import:
```bash
npx tsx scripts/import-trees-csv.ts manytrees trees.csv
```

The import uses **UPSERT** - it updates existing trees without creating duplicates.

### Option 3: Edit in QGIS via Database Connection

Connect QGIS directly to your Neon database:
1. Layer → Add PostgreSQL Layer
2. Enter your database credentials (from `.env.local`)
3. Load `trees` table
4. Edit attributes directly
5. Changes sync to database in real-time!

---

## Recommended Fields (Add When Ready)

### Essential (for map display)
```
name     - Display label on map
variety  - Tree type (Honeycrisp, Gala, etc.)
status   - Health: "healthy", "stressed", or "dead"
```

### Organization
```
block_id  - Block/section identifier
row_id    - Row number/identifier
position  - Tree position in row
```

### Management
```
age              - Tree age in years
height           - Height in meters
planted_date     - When planted (YYYY-MM-DD)
last_pruned      - Last pruning date
last_harvest     - Last harvest date
yield_estimate   - Expected yield in kg
notes            - Any additional notes
```

## Status Values for Color Coding

Use these exact values for proper map colors:
- `healthy` → Green marker 🟢
- `stressed` → Yellow marker 🟡
- `dead` → Red marker 🔴
- (empty) → Green by default

## CSV Format Examples

### Minimal (just locations)
```csv
tree_id,X,Y
MT-001,-123.16743,48.14192
MT-002,-123.16740,48.14195
```

### With basic info
```csv
tree_id,name,variety,status,X,Y
MT-001,Tree 1,Honeycrisp,healthy,-123.16743,48.14192
MT-002,Tree 2,Gala,stressed,-123.16740,48.14195
```

### Full detail
```csv
tree_id,name,variety,status,block_id,row_id,position,age,height,X,Y
MT-001,Tree 1,Honeycrisp,healthy,A,01,1,5,3.2,-123.16743,48.14192
MT-002,Tree 2,Gala,stressed,A,01,2,5,3.1,-123.16740,48.14195
```

## Tips

**Tree ID Naming:**
- Simple: `MT-001`, `MT-002`, `MT-003`...
- Organized: `MT-A-01-001` (Orchard-Block-Row-Position)
- Use consistent format for easier management

**QGIS Export Settings:**
- Always use **Geometry: AS_XY**
- CRS should be EPSG:4326 (WGS 84)
- Column names can be anything (X/Y, lng/lat, Longitude/Latitude all work)

**Coordinate Order:**
- X = Longitude (negative for west) ≈ -123 for Washington
- Y = Latitude (positive for north) ≈ 48 for Washington
- If trees appear wrong, swap X and Y columns

**Re-importing:**
- Safe to re-import same file multiple times
- Uses UPSERT: updates existing trees, creates new ones
- Won't create duplicates (uses tree_id as unique key)

## Workflow Summary

```
1. QGIS: Create point layer (just tree_id field)
2. QGIS: Click on trees to digitize
3. QGIS: Export to CSV with AS_XY geometry
4. Terminal: npx tsx scripts/import-trees-csv.ts manytrees trees.csv
5. Browser: Visit http://localhost:3000 to see trees
6. Add details later via map UI or re-import
```

That's it! Start simple, add details as you go. 🌳
