# Tree Data Import Scripts

This directory contains scripts for importing and managing tree data in the orchard database.

## Database Schema

The database tracks the following information for each tree:

- **tree_id** (required, unique): Unique identifier for the tree (e.g., "WA-R01-P01")
- **name**: Display name for the tree
- **variety**: Tree variety (e.g., "Honeycrisp", "Gala", "Fuji")
- **status**: Health status ("healthy", "stressed", "dead", "unknown")
- **planted_date**: Date the tree was planted (YYYY-MM-DD)
- **block_id**: Block identifier within the orchard
- **row_id**: Row number or identifier
- **position**: Position within the row (integer)
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
npx tsx scripts/import-trees-csv.ts <orchard-id> <csv-file>

# Example:
npx tsx scripts/import-trees-csv.ts washington scripts/import-trees-sample.csv
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
npx tsx scripts/import-trees.ts <json-file>

# Example:
npx tsx scripts/import-trees.ts scripts/import-trees-sample.json
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
npx tsx scripts/import-trees-csv.ts washington my-trees.csv
```

For JSON:
```bash
npx tsx scripts/import-trees.ts my-trees.json
```

### Step 3: Verify Import

1. Check the import report file generated in the same directory
2. Visit the web application and click on trees to see the imported data
3. Failed imports can be fixed and re-imported (updates existing records)

## Tree ID Format Recommendation

We recommend using a consistent format for tree_id:
```
<ORCHARD>-R<ROW>-P<POSITION>

Examples:
- WA-R01-P01 (Washington, Row 1, Position 1)
- CA-R10-P15 (California, Row 10, Position 15)
- OR-B2-R05-P08 (Oregon, Block 2, Row 5, Position 8)
```

## Notes

- The import process uses "upsert" logic: if a tree_id already exists, it updates the record
- You can re-run imports to update existing data
- All imports generate a timestamped report file with success/error details
- Empty or null values in your import file won't overwrite existing data

## Available Orchards

- `washington`: Washington Orchard
- `california`: California Orchard
- `oregon`: Oregon Orchard