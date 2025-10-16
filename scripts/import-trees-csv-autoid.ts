#!/usr/bin/env node

/**
 * Import tree data from CSV with AUTO-GENERATED tree_id
 * Usage: npx tsx scripts/import-trees-csv-autoid.ts <orchard-id> <csv-file>
 * Example: npx tsx scripts/import-trees-csv-autoid.ts manytrees trees.csv
 *
 * ULTRA-SIMPLE QGIS WORKFLOW:
 * Just create two fields in QGIS:
 *   - row_id (Text or Integer) - Row number/name
 *   - position (Integer) - Position in row (column number)
 *
 * CSV format:
 *   row_id,position,X,Y
 *   1,1,-123.16743,48.14192
 *   1,2,-123.16740,48.14195
 *   2,1,-123.16743,48.14200
 *
 * The script will auto-generate tree_id like:
 *   MT-R01-P001 (ManYTrees-Row01-Position001)
 *
 * OPTIONAL COLUMNS (add any you want):
 *   name, variety, status, block_id, age, height, notes, etc.
 *
 * You can add detailed info later via the web map!
 */

import { sql } from '@vercel/postgres';
import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Orchard prefixes for tree_id generation
const ORCHARD_PREFIXES: Record<string, string> = {
  washington: 'WA',
  california: 'CA',
  oregon: 'OR',
  manytrees: 'MT',
};

function generateTreeId(orchardId: string, rowId: string, position: number): string {
  const prefix = ORCHARD_PREFIXES[orchardId] || orchardId.substring(0, 2).toUpperCase();
  const rowPadded = String(rowId).padStart(2, '0');
  const posPadded = String(position).padStart(3, '0');
  return `${prefix}-R${rowPadded}-P${posPadded}`;
}

async function importTreesFromCSV(orchardId: string, filePath: string) {
  try {
    console.log('📂 Reading CSV file...');
    const fileContent = await fs.readFile(filePath, 'utf-8');

    // Parse CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      cast: (value, context) => {
        // Handle empty values
        if (value === '' || value === null) return null;

        // Handle numeric fields
        if (['position', 'age'].includes(context.column as string)) {
          return value ? parseInt(value) : null;
        }
        if (['height', 'lat', 'lng', 'yield_estimate'].includes(context.column as string)) {
          return value ? parseFloat(value) : null;
        }

        return value;
      },
    });

    console.log(`🌳 Found ${records.length} trees to import for orchard: ${orchardId}`);

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ tree_id: string; error: string }> = [];

    for (const record of records) {
      try {
        // Validate required fields
        if (!record.row_id) {
          throw new Error('row_id is required');
        }
        if (!record.position) {
          throw new Error('position is required');
        }

        // Auto-generate tree_id
        const treeId = generateTreeId(orchardId, record.row_id, record.position);

        // Add orchard_id to the record
        const treeData: any = {
          ...record,
          tree_id: treeId,
          orchard_id: orchardId,
        };

        // Handle QGIS XY export format (X=longitude, Y=latitude)
        if (treeData.X && treeData.Y) {
          treeData.lng = treeData.X;
          treeData.lat = treeData.Y;
          delete treeData.X;
          delete treeData.Y;
        }

        // Remove empty/null values
        Object.keys(treeData).forEach(key => {
          if (treeData[key] === null || treeData[key] === '') {
            delete treeData[key];
          }
        });

        // Build the column names and values dynamically
        const columns = Object.keys(treeData);
        const values = Object.values(treeData);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

        // Build the UPDATE clause for conflict resolution
        const updateClauses = columns
          .filter(col => col !== 'tree_id' && col !== 'created_at')
          .map(col => `${col} = EXCLUDED.${col}`)
          .join(', ');

        const query = `
          INSERT INTO trees (${columns.join(', ')})
          VALUES (${placeholders})
          ON CONFLICT (tree_id) DO UPDATE SET
            ${updateClauses},
            updated_at = CURRENT_TIMESTAMP
          RETURNING tree_id
        `;

        await sql.query(query, values);
        successCount++;
        console.log(`✅ Imported tree: ${treeId} (Row ${record.row_id}, Pos ${record.position})`);
      } catch (error: any) {
        errorCount++;
        const treeId = record.tree_id || `R${record.row_id}-P${record.position}`;
        errors.push({
          tree_id: treeId,
          error: error.message || 'Unknown error',
        });
        console.error(`❌ Failed to import tree ${treeId}:`, error.message);
      }
    }

    // Summary
    console.log('\n📊 Import Summary:');
    console.log(`   🌳 Orchard: ${orchardId}`);
    console.log(`   ✅ Successfully imported: ${successCount} trees`);
    console.log(`   ❌ Failed to import: ${errorCount} trees`);

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach(err => {
        console.log(`   - ${err.tree_id}: ${err.error}`);
      });
    }

    // Create a report file
    const reportPath = path.join(
      path.dirname(filePath),
      `import-report-autoid-${Date.now()}.json`
    );

    await fs.writeFile(
      reportPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          input_file: filePath,
          orchard: orchardId,
          total_trees: records.length,
          success_count: successCount,
          error_count: errorCount,
          errors: errors,
        },
        null,
        2
      )
    );

    console.log(`\n📄 Report saved to: ${reportPath}`);
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

// Check command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: npx tsx scripts/import-trees-csv-autoid.ts <orchard-id> <csv-file>');
  console.log('Example: npx tsx scripts/import-trees-csv-autoid.ts manytrees trees.csv');
  console.log('\nAvailable orchards: washington, california, oregon, manytrees');
  console.log('\nULTRA-SIMPLE CSV format (row + position only):');
  console.log('  row_id,position,X,Y');
  console.log('  1,1,-123.16743,48.14192');
  console.log('  1,2,-123.16740,48.14195');
  console.log('\nTree IDs will be auto-generated like: MT-R01-P001');
  process.exit(1);
}

const orchardId = args[0];
const filePath = path.resolve(args[1]);

// Validate orchard ID
if (!['washington', 'california', 'oregon', 'manytrees'].includes(orchardId)) {
  console.error(`❌ Invalid orchard ID: ${orchardId}`);
  console.log('Available orchards: washington, california, oregon, manytrees');
  process.exit(1);
}

// Check if file exists
fs.access(filePath)
  .then(() => importTreesFromCSV(orchardId, filePath))
  .catch(() => {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  });
