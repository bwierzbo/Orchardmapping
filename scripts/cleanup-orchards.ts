import { config } from 'dotenv';
config({ path: '.env.local' });

import { sql } from '@vercel/postgres';

async function cleanupOrchards() {
  console.log('Cleaning up sample orchards without tile config...\n');

  // Delete California and Oregon (sample data with no tiles)
  const result = await sql`
    DELETE FROM orchards
    WHERE id IN ('california', 'oregon')
    RETURNING id, name
  `;

  console.log(`Deleted ${result.rows.length} orchards:`);
  for (const row of result.rows) {
    console.log(`  - ${row.name} (${row.id})`);
  }

  // Show remaining orchards
  const remaining = await sql`SELECT id, name FROM orchards`;
  console.log(`\nRemaining orchards: ${remaining.rows.length}`);
  for (const row of remaining.rows) {
    console.log(`  - ${row.name} (${row.id})`);
  }
}

cleanupOrchards().catch(console.error);
