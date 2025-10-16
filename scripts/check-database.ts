#!/usr/bin/env node

/**
 * Check what's in the Neon database
 */

import { sql } from '@vercel/postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkDatabase() {
  try {
    console.log('🔍 Checking Neon database connection...\n');

    // Check orchards
    const orchards = await sql`SELECT id, name, location FROM orchards ORDER BY id`;
    console.log('📍 Orchards in database:');
    orchards.rows.forEach(o => {
      console.log(`  - ${o.id}: ${o.name} (${o.location})`);
    });

    // Check trees
    const trees = await sql`
      SELECT orchard_id, COUNT(*) as count
      FROM trees
      GROUP BY orchard_id
      ORDER BY orchard_id
    `;
    console.log('\n🌳 Trees by orchard:');
    if (trees.rows.length === 0) {
      console.log('  (no trees yet)');
    } else {
      trees.rows.forEach(t => {
        console.log(`  - ${t.orchard_id}: ${t.count} trees`);
      });
    }

    // Show sample trees
    const sampleTrees = await sql`
      SELECT tree_id, name, variety, status, lat, lng, orchard_id
      FROM trees
      LIMIT 5
    `;

    if (sampleTrees.rows.length > 0) {
      console.log('\n🌲 Sample trees:');
      sampleTrees.rows.forEach(t => {
        console.log(`  - ${t.tree_id}: ${t.name || 'unnamed'} (${t.variety || 'unknown variety'}) - ${t.status} @ ${t.lat},${t.lng}`);
      });
    }

    console.log('\n✅ Database connection successful!');
    console.log(`📊 Database URL: ${process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'configured'}`);

  } catch (error) {
    console.error('❌ Database error:', error);
    process.exit(1);
  }
}

checkDatabase();
