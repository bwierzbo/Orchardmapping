# Tree Data Import Scripts

This directory contains scripts for importing and managing tree data in the orchard database.

## Database Schema

The database tracks the following information for each tree:

- **tree_id** (issued by the database, never supplied): permanent id, e.g. `OBC-001-0142` — site code, orchard code, tree number. Include it in an import file only to say *which existing tree* a row is about; a file without it is matched by address instead.
- **block_id / row_id / position**: the tree's address. All three are optional and freely editable — a tree may sit in a block with no rows, or be unplaced entirely.
- **name**: Display name for the tree
- **variety**: Tree variety (e.g., "Honeycrisp", "Gala", "Fuji")
- **status**: Health status ("healthy", "stressed", "dead", "unknown")
- **planted_date**: Date the tree was planted (YYYY-MM-DD)
- **age**: Age of the tree in years
- **height**: Height in meters (decimal)
- **lat/lng**: Geographic coordinates
- **last_pruned**: Date of last pruning (YYYY-MM-DD)
- **last_harvest**: Date of last harvest (YYYY-MM-DD)
- **yield_estimate**: Estimated yield in kg (decimal)
- **notes**: Additional notes or observations

## Import Methods

### 1. CSV Import (Recommended for Spreadsheets)

Best for importing data from Excel or Google Sheets.

**Format:** See `import-trees-sample.csv` for the exact format.

**Usage:**
```bash
npx tsx scripts/import-trees.ts <orchard-id> <csv-file> [--dry-run]

# Example:
npx tsx scripts/import-trees.ts finn-hall scripts/import-trees-sample.csv --dry-run
```

**Tips:**
- Leave cells empty for unknown values
- Status options: "healthy", "stressed", "dead", "unknown"
- Dates should be in YYYY-MM-DD format
- Coordinates should be decimal degrees (not DMS)

### 2. JSON Import (For Programmatic Use)

Best for importing data from other systems or APIs.

**Format:** See `import-trees-sample.json` for the structure.

**Usage:**
```bash
npx tsx scripts/import-trees.ts <orchard-id> <json-file> [--dry-run]

# Example:
npx tsx scripts/import-trees.ts finn-hall scripts/import-trees-sample.json
```

### 3. Export from PMTiles

Extract existing tree data from PMTiles files to create import templates.

**Usage:**
```bash
npx tsx scripts/export-pmtiles-trees.ts
```

This creates template files for each orchard that you can fill with enriched data.

## Workflow Example

### Step 1: Create Your Data File

Option A: Use Excel/Google Sheets
1. Copy the format from `import-trees-sample.csv`
2. Fill in your tree data
3. Export as CSV

Option B: Use the PMTiles export
1. Run `npx tsx scripts/export-pmtiles-trees.ts`
2. Edit the generated JSON files with your data

### Step 2: Import the Data

For CSV:
```bash
npx tsx scripts/import-trees.ts finn-hall my-trees.csv
```

For JSON:
```bash
npx tsx scripts/import-trees.ts finn-hall my-trees.json
```

### Step 3: Verify Import

1. Check the import report file generated in the same directory
2. Visit the web application and click on trees to see the imported data
3. Failed imports can be fixed and re-imported (updates existing records)

## Tree ID Format

Ids are issued by the database and are **not** yours to choose:

```
OBC-001-0142
 │   │    └── 142nd tree recorded in that orchard (never reused, never reset)
 │   └─────── sub-orchard 002 at that site
 └─────────── site code

```

The middle part names the planting a tree belongs to and is permanent. It is
**not** the `block_id` field, which is part of the mutable address. Before
migration 049 a tree's id was its address, which is why moving one used to
mean renaming it and rewriting its history.

## Notes

- The import matches a row by `tree_id` when the file has one, and by address otherwise; matched rows are updated, the rest become new trees
- You can re-run imports to update existing data
- All imports generate a timestamped report file with success/error details
- Empty or null values in your import file won't overwrite existing data

## Available Orchards

- `washington`: Washington Orchard
- `california`: California Orchard
- `oregon`: Oregon Orchard