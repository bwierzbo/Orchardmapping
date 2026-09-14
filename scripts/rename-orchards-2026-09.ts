/**
 * One-off (2026-09-14): owner-requested renames — display is
 * "name, address", so name carries the new title and location the street
 * address. Many Trees keeps its existing location (no new address given).
 */
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { sql } = await import('@vercel/postgres');

  const before = await sql`SELECT id, name, location FROM orchards ORDER BY id`;
  console.table(before.rows);

  await sql`UPDATE orchards SET name = 'Olympic Bluffs Cidery', location = '1027 Finn Hall Road' WHERE id = 'finn-hall'`;
  await sql`UPDATE orchards SET name = 'Marty Huffman and Michelle McGuiness Orchard' WHERE id = 'manytrees'`;
  await sql`UPDATE orchards SET name = 'Farm House Orchard', location = '519 Finn Hall Road' WHERE id = 'washington'`;

  const after = await sql`SELECT id, name, location FROM orchards ORDER BY id`;
  console.table(after.rows);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
