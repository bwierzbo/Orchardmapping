import { config } from 'dotenv';
config({ path: '.env.local' });

import { sql } from '@vercel/postgres';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigration() {
  console.log('Running migration 002: Add users table...\n');

  try {
    const migrationPath = join(process.cwd(), 'lib/db/migrations/002_add_users_table.sql');
    const migrationSql = readFileSync(migrationPath, 'utf-8');

    // Split by semicolons and run each statement
    const statements = migrationSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      console.log('Executing:', statement.substring(0, 60) + '...');
      await sql.query(statement);
    }

    console.log('\nMigration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local');
    console.log('2. Run: npx tsx scripts/seed-admin.ts');
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('Users table already exists. Skipping...');
    } else {
      console.error('Migration error:', error.message);
      process.exit(1);
    }
  }
}

runMigration();
