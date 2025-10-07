# Tree Renumbering Guide

## Overview

You can change your tree numbering scheme at any time using the renumbering scripts. This is useful when:
- You realize you started numbering from the wrong corner
- You want to switch from numeric to alphanumeric rows (1,2,3 → A,B,C)
- You need to reorganize after adding or removing rows
- You want to add block identifiers

## Quick Start

### 1. Export Current Trees
First, see what you currently have:

```bash
# Export as CSV (for Excel/Sheets)
npx tsx scripts/export-current-trees.ts washington csv

# Export as JSON (for review)
npx tsx scripts/export-current-trees.ts washington json
```

### 2. Create Your Renumbering Plan

#### Option A: Simple Renumbering (Recommended)
Edit the exported CSV in Excel/Google Sheets:
1. Keep all existing data
2. Just change the `tree_id`, `row_id`, and `position` columns
3. Save as CSV
4. Re-import with: `npx tsx scripts/import-trees-csv.ts washington your-updated-file.csv`

#### Option B: Using Renumber Script
Create a JSON mapping file (see examples below) and run:
```bash
npx tsx scripts/renumber-trees.ts your-mapping.json
```

## Common Renumbering Scenarios

### Scenario 1: Change from R01-P01 to 001-001 Format

```json
{
  "orchard": "washington",
  "mapping": [
    {
      "old_tree_id": "WA-R01-P01",
      "new_tree_id": "WA-001-001",
      "row_id": "001",
      "position": 1
    },
    {
      "old_tree_id": "WA-R01-P02",
      "new_tree_id": "WA-001-002",
      "row_id": "001",
      "position": 2
    }
  ]
}
```

### Scenario 2: Switch to Alphabetic Rows

```json
{
  "orchard": "washington",
  "mapping": [
    {
      "old_tree_id": "WA-R01-P01",
      "new_tree_id": "WA-A-01",
      "row_id": "A",
      "position": 1
    },
    {
      "old_tree_id": "WA-R02-P01",
      "new_tree_id": "WA-B-01",
      "row_id": "B",
      "position": 1
    }
  ]
}
```

### Scenario 3: Reverse Row Direction
If you numbered rows from north to south but want south to north:

```json
{
  "orchard": "washington",
  "mapping": [
    {
      "old_tree_id": "WA-R01-P01",
      "new_tree_id": "WA-R10-P01",
      "row_id": "10",
      "position": 1
    },
    {
      "old_tree_id": "WA-R02-P01",
      "new_tree_id": "WA-R09-P01",
      "row_id": "9",
      "position": 1
    }
  ]
}
```

### Scenario 4: Reverse Position Direction Within Rows
If you numbered positions left-to-right but want right-to-left:

```json
{
  "orchard": "washington",
  "mapping": [
    {
      "old_tree_id": "WA-R01-P01",
      "new_tree_id": "WA-R01-P10",
      "row_id": "1",
      "position": 10
    },
    {
      "old_tree_id": "WA-R01-P02",
      "new_tree_id": "WA-R01-P09",
      "row_id": "1",
      "position": 9
    },
    {
      "old_tree_id": "WA-R01-P03",
      "new_tree_id": "WA-R01-P08",
      "row_id": "1",
      "position": 8
    }
  ]
}
```

### Scenario 5: Add Block Identifiers

```json
{
  "orchard": "washington",
  "mapping": [
    {
      "old_tree_id": "WA-R01-P01",
      "new_tree_id": "WA-A1-R01-P01",
      "row_id": "1",
      "position": 1,
      "block_id": "A1"
    },
    {
      "old_tree_id": "WA-R01-P02",
      "new_tree_id": "WA-A1-R01-P02",
      "row_id": "1",
      "position": 2,
      "block_id": "A1"
    }
  ]
}
```

## Tips

1. **Always export first** to see your current numbering
2. **Test with a few trees** before renumbering everything
3. **Keep backups** - the export files serve as backups
4. **The easiest method** is usually to export to CSV, change the IDs in Excel, and re-import
5. **Renumbering doesn't lose data** - all your enriched data (variety, health, yield, etc.) is preserved

## Excel/Sheets Method (Simplest)

1. Export current data:
   ```bash
   npx tsx scripts/export-current-trees.ts washington csv
   ```

2. Open in Excel or Google Sheets

3. Change only these columns as needed:
   - `tree_id` - The unique identifier
   - `row_id` - The row number/letter
   - `position` - Position within the row
   - `block_id` - Optional block identifier

4. Save as CSV

5. Re-import:
   ```bash
   npx tsx scripts/import-trees-csv.ts washington your-file.csv
   ```

The import will update existing trees based on matching them up.

## Need Help?

If you're unsure about your renumbering scheme, export your current data first and experiment with a copy!