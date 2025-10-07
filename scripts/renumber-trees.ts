#!/usr/bin/env node

/**
 * Renumber trees with a new row/position scheme
 * Usage: npx tsx scripts/renumber-trees.ts <orchard-id> <mapping-file>
 * Example: npx tsx scripts/renumber-trees.ts washington scripts/renumber-mapping.json
 */

import { sql } from '@vercel/postgres';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface TreeMapping {
  old_tree_id?: string;
  new_tree_id: string;
  row_id: string | number;
  position: number;
  block_id?: string;
  // Optional: update coordinates if trees were re-surveyed
  lat?: number;
  lng?: number;
}

interface RenumberConfig {
  orchard: string;
  mapping: TreeMapping[];
}

async function renumberTrees(filePath: string) {
  try {
    console.log('📂 Reading mapping file...');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const config: RenumberConfig = JSON.parse(fileContent);

    console.log(`🌳 Renumbering ${config.mapping.length} trees in orchard: ${config.orchard}`);

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ tree_id: string; error: string }> = [];
    const updates: Array<{ old: string; new: string }> = [];

    for (const mapping of config.mapping) {
      try {
        // If old_tree_id is provided, update existing tree
        if (mapping.old_tree_id) {
          // Build update fields
          const updateFields: any = {
            tree_id: mapping.new_tree_id,
            row_id: String(mapping.row_id),
            position: mapping.position,
          };

          if (mapping.block_id !== undefined) updateFields.block_id = mapping.block_id;
          if (mapping.lat !== undefined) updateFields.lat = mapping.lat;
          if (mapping.lng !== undefined) updateFields.lng = mapping.lng;

          // First check if old tree exists
          const existing = await sql`
            SELECT tree_id FROM trees
            WHERE tree_id = ${mapping.old_tree_id}
          `;

          if (existing.rows.length === 0) {
            errorCount++;
            errors.push({
              tree_id: mapping.old_tree_id,
              error: 'Tree not found in database',
            });
            console.log(`⚠️  Tree not found: ${mapping.old_tree_id}`);
            continue;
          }

          // Update the tree
          await sql`
            UPDATE trees
            SET
              tree_id = ${updateFields.tree_id},
              row_id = ${updateFields.row_id},
              position = ${updateFields.position},
              block_id = COALESCE(${updateFields.block_id}, block_id),
              lat = COALESCE(${updateFields.lat}, lat),
              lng = COALESCE(${updateFields.lng}, lng),
              updated_at = CURRENT_TIMESTAMP
            WHERE tree_id = ${mapping.old_tree_id}
          `;

          successCount++;
          updates.push({ old: mapping.old_tree_id, new: mapping.new_tree_id });
          console.log(`✅ Renumbered: ${mapping.old_tree_id} → ${mapping.new_tree_id} (Row ${mapping.row_id}, Pos ${mapping.position})`);
        } else {
          // No old_tree_id provided, try to find tree by position
          const existing = await sql`
            SELECT tree_id FROM trees
            WHERE orchard_id = ${config.orchard}
              AND row_id = ${String(mapping.row_id)}
              AND position = ${mapping.position}
          `;

          if (existing.rows.length > 0) {
            // Update existing tree at this position
            await sql`
              UPDATE trees
              SET
                tree_id = ${mapping.new_tree_id},
                block_id = COALESCE(${mapping.block_id}, block_id),
                lat = COALESCE(${mapping.lat}, lat),
                lng = COALESCE(${mapping.lng}, lng),
                updated_at = CURRENT_TIMESTAMP
              WHERE orchard_id = ${config.orchard}
                AND row_id = ${String(mapping.row_id)}
                AND position = ${mapping.position}
            `;

            successCount++;
            updates.push({ old: existing.rows[0].tree_id, new: mapping.new_tree_id });
            console.log(`✅ Renumbered: ${existing.rows[0].tree_id} → ${mapping.new_tree_id}`);
          } else {
            errorCount++;
            errors.push({
              tree_id: `Row ${mapping.row_id}, Pos ${mapping.position}`,
              error: 'No tree found at this position',
            });
            console.log(`⚠️  No tree at Row ${mapping.row_id}, Position ${mapping.position}`);
          }
        }
      } catch (error: any) {
        errorCount++;
        errors.push({
          tree_id: mapping.old_tree_id || mapping.new_tree_id,
          error: error.message || 'Unknown error',
        });
        console.error(`❌ Failed to renumber tree:`, error.message);
      }
    }

    // Summary
    console.log('\n📊 Renumbering Summary:');
    console.log(`   ✅ Successfully renumbered: ${successCount} trees`);
    console.log(`   ❌ Failed to renumber: ${errorCount} trees`);

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach(err => {
        console.log(`   - ${err.tree_id}: ${err.error}`);
      });
    }

    // Create a report file
    const reportPath = path.join(
      path.dirname(filePath),
      `renumber-report-${Date.now()}.json`
    );

    await fs.writeFile(
      reportPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          input_file: filePath,
          orchard: config.orchard,
          total_trees: config.mapping.length,
          success_count: successCount,
          error_count: errorCount,
          updates: updates,
          errors: errors,
        },
        null,
        2
      )
    );

    console.log(`\n📄 Report saved to: ${reportPath}`);
  } catch (error) {
    console.error('❌ Renumbering failed:', error);
    process.exit(1);
  }
}

// Check command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: npx tsx scripts/renumber-trees.ts <mapping-file>');
  console.log('Example: npx tsx scripts/renumber-trees.ts scripts/renumber-mapping.json');
  process.exit(1);
}

const filePath = path.resolve(args[0]);

// Check if file exists
fs.access(filePath)
  .then(() => renumberTrees(filePath))
  .catch(() => {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  });