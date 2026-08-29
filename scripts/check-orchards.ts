import { config } from 'dotenv';
config({ path: '.env.local' });

import { sql } from '@vercel/postgres';

async function checkOrchards() {
  console.log('Checking orchards in database...\n');

  const result = await sql`
    SELECT id, name, ortho_pmtiles_url, vector_pmtiles_url, bounds_min_lng, center_lat
    FROM orchards
  `;

  console.log(`Found ${result.rows.length} orchards:\n`);

  for (const row of result.rows) {
    console.log(`- ${row.name} (${row.id})`);
    console.log(`  Ortho URL: ${row.ortho_pmtiles_url || '(none)'}`);
    console.log(`  Vector URL: ${row.vector_pmtiles_url || '(none)'}`);
    console.log(`  Bounds: ${row.bounds_min_lng || '(not set)'}`);
    console.log(`  Center Lat: ${row.center_lat || '(not set)'}`);
    console.log('');
  }
}

checkOrchards().catch(console.error);
