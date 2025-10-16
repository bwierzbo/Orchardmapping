# The Easiest QGIS Workflow - Just Row & Column!

The absolute simplest way to map your trees. No tree IDs to track - just row and position numbers!

## Quick Start (Literally 2 Fields)

### 1. QGIS Setup (Super Simple)

Create a point layer with **only 2 fields**:

```
row_id   (Text or Integer, 10)  - Row number (1, 2, 3... or A, B, C...)
position (Integer)              - Position in row (1, 2, 3...)
```

That's it! Tree IDs are auto-generated from these!

### 2. Click Trees

When you click each tree, just enter:
- **Row**: Which row is this tree in? (1, 2, 3, or A, B, C, etc.)
- **Position**: Which position in the row? (1, 2, 3...)

Example:
```
Row 1, Position 1
Row 1, Position 2
Row 1, Position 3
Row 2, Position 1
Row 2, Position 2
```

### 3. Export CSV

Right-click layer → Export → Save Features As:
- **Format**: CSV
- **Geometry**: AS_XY (important!)
- **Filename**: `trees.csv`

Your CSV will look like:
```csv
row_id,position,X,Y
1,1,-123.16743,48.14192
1,2,-123.16740,48.14195
1,3,-123.16738,48.14198
2,1,-123.16745,48.14200
2,2,-123.16742,48.14203
```

### 4. Import with Auto-Generated IDs

```bash
npx tsx scripts/import-trees-csv-autoid.ts manytrees trees.csv
```

The script automatically creates tree IDs:
```
Row 1, Pos 1 → MT-R01-P001
Row 1, Pos 2 → MT-R01-P002
Row 2, Pos 1 → MT-R02-P001
```

### 5. Done!

Visit http://localhost:3000 → Many Trees orchard

All trees are now on the map with clean IDs!

---

## Why This Works Better

### Traditional Way (Harder):
❌ Track tree IDs manually: "What number am I on?"
❌ Risk of duplicates or typos
❌ Hard to remember ID sequence

### Row + Position Way (Easier):
✅ Just count: "Row 1, tree 1, 2, 3..."
✅ Spatially meaningful
✅ Easy to verify ("Did I get all trees in row 2?")
✅ IDs generated consistently

---

## Auto-Generated ID Formats

The script creates IDs based on orchard:

| Orchard | Row | Position | Generated ID |
|---------|-----|----------|--------------|
| manytrees | 1 | 1 | MT-R01-P001 |
| manytrees | 5 | 23 | MT-R05-P023 |
| manytrees | A | 10 | MT-R0A-P010 |
| washington | 3 | 5 | WA-R03-P005 |

---

## Optional: Add More Info

You can add extra fields in QGIS if you want:

```
row_id     - REQUIRED
position   - REQUIRED
variety    - Optional (Honeycrisp, Gala, etc.)
status     - Optional (healthy, stressed, dead)
block_id   - Optional (A, B, C...)
notes      - Optional (any notes)
```

Example CSV with extra info:
```csv
row_id,position,variety,status,X,Y
1,1,Honeycrisp,healthy,-123.16743,48.14192
1,2,Gala,healthy,-123.16740,48.14195
1,3,Fuji,stressed,-123.16738,48.14198
```

Or add info later via the web map!

---

## Tips

### Row Numbering
Use whatever makes sense:
- Numbers: `1, 2, 3, 4...`
- Letters: `A, B, C, D...`
- Mixed: `1A, 1B, 2A, 2B...`

### Position Numbering
Always use numbers: `1, 2, 3, 4...`

Start from one end and count consistently!

### Dealing with Gaps
If a tree is missing (dead/removed):
- Option 1: Skip that position number (e.g., 1, 2, 4, 5 - skip 3)
- Option 2: Add it with status "dead"

### Blocks
If you have multiple blocks, add `block_id` field:
```csv
block_id,row_id,position,X,Y
A,1,1,-123.16743,48.14192
A,1,2,-123.16740,48.14195
B,1,1,-123.16850,48.14192
```

IDs stay unique: MT-R01-P001, MT-R01-P002 (row numbers can repeat across blocks)

---

## Comparison

### Method 1: Manual Tree IDs
```
QGIS Fields: tree_id
CSV: tree_id,X,Y
Import: import-trees-csv.ts
```

### Method 2: Row + Position (THIS ONE!)
```
QGIS Fields: row_id, position
CSV: row_id,position,X,Y
Import: import-trees-csv-autoid.ts
```

### Method 3: Just Coordinates (Even Simpler?)
See `MINIMAL-QGIS-WORKFLOW.md` - uses auto-numbered IDs

---

## Files

- **Example CSV**: `scripts/example-row-position-trees.csv`
- **Import Script**: `scripts/import-trees-csv-autoid.ts`

## Full Commands

```bash
# Import with auto-generated IDs
npx tsx scripts/import-trees-csv-autoid.ts manytrees trees.csv

# Check what's in database
npx tsx scripts/check-database.ts

# View on map
npm run dev
# Then visit: http://localhost:3000
```

---

## Workflow Summary

```
1. QGIS: Create point layer (row_id + position fields only)
2. QGIS: Click trees, enter row and position numbers
3. QGIS: Export to CSV with AS_XY geometry
4. Terminal: npx tsx scripts/import-trees-csv-autoid.ts manytrees trees.csv
5. Browser: Visit http://localhost:3000 to see trees with auto-generated IDs
6. Add variety, status, etc. later via web map
```

**Best for:** Orchards with organized rows where you can easily count position in row.

**Perfect workflow:** Just count along each row! 🌳
