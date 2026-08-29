/**
 * Minimal SQL migrations runner.
 *
 * Applies lib/db/migrations/*.sql in filename order, each inside a
 * transaction, recording applied names in _migrations. Idempotent:
 * already-recorded migrations are skipped.
 *
 * Usage: pnpm db:migrate            (applies pending migrations)
 *        pnpm db:migrate -- --status  (lists applied/pending, no writes)
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { sql } from '@vercel/postgres';
import * as fs from 'fs/promises';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(process.cwd(), 'lib/db/migrations');

async function main() {
  const statusOnly = process.argv.includes('--status');

  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = await sql.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query('SELECT name FROM _migrations');
    const applied = new Set(rows.map((r) => r.name as string));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`= ${file} (applied)`);
        continue;
      }
      if (statusOnly) {
        console.log(`~ ${file} (pending)`);
        continue;
      }

      const sqlText = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf-8');
      console.log(`> applying ${file} ...`);
      try {
        await client.query('BEGIN');
        await client.query(sqlText);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✓ ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`✗ ${file} failed and was rolled back:`);
        throw error;
      }
    }
  } finally {
    client.release();
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
