#!/usr/bin/env node

/**
 * Import tree data from CSV into the database
 * Usage: npx tsx scripts/import-trees-csv.ts <orchard-id> <csv-file>
 * Example: npx tsx scripts/import-trees-csv.ts washington scripts/import-trees-sample.csv
 */

import { sql } from '@vercel/postgres';
import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

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
        // Add orchard_id to the record
        const treeData = {
          ...record,
          orchard_id: orchardId,
        };

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
        console.log(`✅ Imported tree: ${treeData.tree_id}`);
      } catch (error: any) {
        errorCount++;
        errors.push({
          tree_id: record.tree_id || 'Unknown',
          error: error.message || 'Unknown error',
        });
        console.error(`❌ Failed to import tree ${record.tree_id}:`, error.message);
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
      `import-report-csv-${Date.now()}.json`
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
  console.log('Usage: npx tsx scripts/import-trees-csv.ts <orchard-id> <csv-file>');
  console.log('Example: npx tsx scripts/import-trees-csv.ts washington scripts/import-trees-sample.csv');
  console.log('\nAvailable orchards: washington, california, oregon');
  process.exit(1);
}

const orchardId = args[0];
const filePath = path.resolve(args[1]);

// Validate orchard ID
if (!['washington', 'california', 'oregon'].includes(orchardId)) {
  console.error(`❌ Invalid orchard ID: ${orchardId}`);
  console.log('Available orchards: washington, california, oregon');
  process.exit(1);
}

// Check if file exists
fs.access(filePath)
  .then(() => importTreesFromCSV(orchardId, filePath))
  .catch(() => {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  });