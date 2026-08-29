/**
 * Run database migration to add orchard tile columns
 * Usage: npx tsx scripts/run-migration.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { sql } from '@vercel/postgres';

async function runMigration() {
  console.log('Running database migration...\n');

  try {
    // Add description column
    console.log('Adding description column...');
    await sql`ALTER TABLE orchards ADD COLUMN IF NOT EXISTS description TEXT`;

    // Add bounds columns
    console.log('Adding bounds columns...');
    await sql`ALTER TABLE orchards ADD COLUMN IF NOT EXISTS bounds_min_lng DECIMAL(11, 8)`;
    await sql`ALTER TABLE orchards ADD COLUMN IF NOT EXISTS bounds_min_lat DECIMAL(10, 8)`;
    await sql`ALTER TABLE orchards ADD COLUMN IF NOT EXISTS bounds_max_lng DECIMAL(11, 8)`;
    await sql`ALTER TABLE orchards ADD COLUMN IF NOT EXISTS bounds_max_lat DECIMAL(10, 8)`;

    // Add zoom level columns
    console.log('Adding zoom level columns...');
    await sql`ALTER TABLE orchards ADD COLUMN IF NOT EXISTS default_zoom DECIMAL(4, 2) DEFAULT 18`;
    await sql`ALTER TABLE orchards ADD COLUMN IF NOT EXISTS min_zoom DECIMAL(4, 2) DEFAULT 5`;
    await sql`ALTER TABLE orchards ADD COLUMN IF NOT EXISTS max_zoom DECIMAL(4, 2) DEFAULT 21.5`;
    await sql`ALTER TABLE orchards ADD COLUMN IF NOT EXISTS tile_min_zoom INTEGER DEFAULT 5`;
    await sql`ALTER TABLE orchards ADD COLUMN IF NOT EXISTS tile_max_zoom INTEGER DEFAULT 23`;

    // Add tile URL columns
    console.log('Adding tile URL columns...');
    await sql`ALTER TABLE orchards ADD COLUMN IF NOT EXISTS ortho_pmtiles_url TEXT`;
    await sql`ALTER TABLE orchards ADD COLUMN IF NOT EXISTS vector_pmtiles_url TEXT`;
    await sql`ALTER TABLE orchards ADD COLUMN IF NOT EXISTS preview_image_url TEXT`;

    // Add legacy API path column
    console.log('Adding ortho_api_path column...');
    await sql`ALTER TABLE orchards ADD COLUMN IF NOT EXISTS ortho_api_path TEXT`;

    // Create index
    console.log('Creating index...');
    await sql`CREATE INDEX IF NOT EXISTS idx_orchards_id ON orchards(id)`;

    console.log('\n✅ Migration completed successfully!');

    // Show current table structure
    console.log('\nVerifying columns...');
    const result = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'orchards'
      ORDER BY ordinal_position
    `;

    console.log('\nOrchards table columns:');
    for (const row of result.rows) {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
