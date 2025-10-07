#!/usr/bin/env node

/**
 * Export current tree data from database to CSV or JSON
 * Usage: npx tsx scripts/export-current-trees.ts <orchard-id> [format]
 * Example: npx tsx scripts/export-current-trees.ts washington csv
 */

import { sql } from '@vercel/postgres';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { stringify } from 'csv-stringify/sync';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function exportTrees(orchardId: string, format: 'csv' | 'json' = 'csv') {
  try {
    console.log(`📂 Exporting trees for orchard: ${orchardId}`);

    // Fetch all trees for the orchard
    const result = await sql`
      SELECT
        tree_id,
        name,
        variety,
        status,
        planted_date,
        block_id,
        row_id,
        position,
        age,
        height,
        lat,
        lng,
        last_pruned,
        last_harvest,
        yield_estimate,
        notes
      FROM trees
      WHERE orchard_id = ${orchardId}
      ORDER BY
        CAST(NULLIF(regexp_replace(row_id, '[^0-9]', '', 'g'), '') AS INTEGER) NULLS LAST,
        row_id,
        position
    `;

    if (result.rows.length === 0) {
      console.log(`⚠️  No trees found for orchard: ${orchardId}`);
      return;
    }

    console.log(`🌳 Found ${result.rows.length} trees`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let outputPath: string;

    if (format === 'csv') {
      // Convert to CSV
      const csv = stringify(result.rows, {
        header: true,
        columns: [
          'tree_id',
          'name',
          'variety',
          'status',
          'planted_date',
          'block_id',
          'row_id',
          'position',
          'age',
          'height',
          'lat',
          'lng',
          'last_pruned',
          'last_harvest',
          'yield_estimate',
          'notes'
        ],
        cast: {
          date: (value) => {
            if (!value) return '';
            return value.toISOString().split('T')[0];
          }
        }
      });

      outputPath = path.join('scripts', `${orchardId}-trees-export-${timestamp}.csv`);
      await fs.writeFile(outputPath, csv);
    } else {
      // Export as JSON
      const jsonData = {
        orchard: orchardId,
        export_date: new Date().toISOString(),
        total_trees: result.rows.length,
        trees: result.rows.map(row => ({
          ...row,
          planted_date: row.planted_date ? row.planted_date.toISOString().split('T')[0] : null,
          last_pruned: row.last_pruned ? row.last_pruned.toISOString().split('T')[0] : null,
          last_harvest: row.last_harvest ? row.last_harvest.toISOString().split('T')[0] : null,
        }))
      };

      outputPath = path.join('scripts', `${orchardId}-trees-export-${timestamp}.json`);
      await fs.writeFile(outputPath, JSON.stringify(jsonData, null, 2));
    }

    console.log(`✅ Exported to: ${outputPath}`);

    // Show summary statistics
    const stats = {
      total: result.rows.length,
      healthy: result.rows.filter(t => t.status === 'healthy').length,
      stressed: result.rows.filter(t => t.status === 'stressed').length,
      dead: result.rows.filter(t => t.status === 'dead').length,
      unknown: result.rows.filter(t => !t.status || t.status === 'unknown').length,
    };

    console.log('\n📊 Tree Statistics:');
    console.log(`   Total: ${stats.total}`);
    console.log(`   Healthy: ${stats.healthy}`);
    console.log(`   Stressed: ${stats.stressed}`);
    console.log(`   Dead: ${stats.dead}`);
    console.log(`   Unknown: ${stats.unknown}`);

    // Row distribution
    const rowCounts = result.rows.reduce((acc: any, tree: any) => {
      const row = tree.row_id || 'unknown';
      acc[row] = (acc[row] || 0) + 1;
      return acc;
    }, {});

    console.log('\n📍 Trees per row:');
    Object.entries(rowCounts)
      .sort(([a], [b]) => {
        // Try to sort numerically if possible
        const aNum = parseInt(a);
        const bNum = parseInt(b);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.localeCompare(b);
      })
      .forEach(([row, count]) => {
        console.log(`   Row ${row}: ${count} trees`);
      });

  } catch (error) {
    console.error('❌ Export failed:', error);
    process.exit(1);
  }
}

// Check command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: npx tsx scripts/export-current-trees.ts <orchard-id> [format]');
  console.log('Examples:');
  console.log('  npx tsx scripts/export-current-trees.ts washington csv');
  console.log('  npx tsx scripts/export-current-trees.ts washington json');
  console.log('\nAvailable orchards: washington, california, oregon');
  console.log('Formats: csv (default), json');
  process.exit(1);
}

const orchardId = args[0];
const format = (args[1] || 'csv') as 'csv' | 'json';

// Validate orchard ID
if (!['washington', 'california', 'oregon'].includes(orchardId)) {
  console.error(`❌ Invalid orchard ID: ${orchardId}`);
  console.log('Available orchards: washington, california, oregon');
  process.exit(1);
}

// Validate format
if (!['csv', 'json'].includes(format)) {
  console.error(`❌ Invalid format: ${format}`);
  console.log('Available formats: csv, json');
  process.exit(1);
}

exportTrees(orchardId, format).catch(console.error);