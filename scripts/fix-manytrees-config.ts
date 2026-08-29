/**
 * Fix manytrees orchard configuration to use local PMTiles
 * instead of the mbtiles API route that requires sqlite3.
 *
 * Run with: npx tsx scripts/fix-manytrees-config.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { sql } from '@vercel/postgres';

async function fixManytreesConfig() {
  console.log('Updating manytrees orchard to use local PMTiles...\n');

  try {
    // Update manytrees to use the local fixed PMTiles file
    // The file is at: public/orchards/manytreesorchard/manytrees-fixed.pmtiles
    // When served, it's available at: /orchards/manytreesorchard/manytrees-fixed.pmtiles
    await sql`
      UPDATE orchards SET
        ortho_pmtiles_url = '/orchards/manytreesorchard/manytrees-fixed.pmtiles',
        ortho_api_path = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 'manytrees'
    `;

    console.log('✓ manytrees orchard updated successfully!');
    console.log('  Now using: /orchards/manytreesorchard/manytrees-fixed.pmtiles');
    console.log('\nRestart your dev server to see the changes.');
  } catch (error) {
    console.error('Failed to update:', error);
  }
}

fixManytreesConfig().catch(console.error);
