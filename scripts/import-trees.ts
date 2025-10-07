#!/usr/bin/env node

/**
 * Import tree data into the database
 * Usage: npx tsx scripts/import-trees.ts <json-file>
 * Example: npx tsx scripts/import-trees.ts scripts/import-trees-sample.json
 */

import { sql } from '@vercel/postgres';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface TreeImport {
  tree_id: string;
  name?: string;
  variety?: string;
  status?: string;
  planted_date?: string;
  block_id?: string;
  row_id?: string;
  position?: number;
  age?: number;
  height?: number;
  lat?: number;
  lng?: number;
  last_pruned?: string;
  last_harvest?: string;
  yield_estimate?: number;
  notes?: string;
}

interface ImportData {
  orchard: string;
  trees: TreeImport[];
}

async function importTrees(filePath: string) {
  try {
    console.log('📂 Reading import file...');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data: ImportData = JSON.parse(fileContent);

    console.log(`🌳 Found ${data.trees.length} trees to import for orchard: ${data.orchard}`);

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ tree_id: string; error: string }> = [];

    for (const tree of data.trees) {
      try {
        // Prepare the tree data
        const treeData = {
          ...tree,
          orchard_id: data.orchard,
        };

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
        console.log(`✅ Imported tree: ${tree.tree_id}`);
      } catch (error: any) {
        errorCount++;
        errors.push({
          tree_id: tree.tree_id,
          error: error.message || 'Unknown error',
        });
        console.error(`❌ Failed to import tree ${tree.tree_id}:`, error.message);
      }
    }

    // Summary
    console.log('\n📊 Import Summary:');
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
      `import-report-${Date.now()}.json`
    );

    await fs.writeFile(
      reportPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          input_file: filePath,
          orchard: data.orchard,
          total_trees: data.trees.length,
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
if (args.length === 0) {
  console.log('Usage: npx tsx scripts/import-trees.ts <json-file>');
  console.log('Example: npx tsx scripts/import-trees.ts scripts/import-trees-sample.json');
  process.exit(1);
}

const filePath = path.resolve(args[0]);

// Check if file exists
fs.access(filePath)
  .then(() => importTrees(filePath))
  .catch(() => {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  });