import { config } from 'dotenv';
config({ path: '.env.local' });

import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';

async function seedAdmin() {
  // Get admin credentials from environment or use prompts
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Admin';

  if (!email || !password) {
    console.error('Error: ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env.local');
    console.log('\nExample:');
    console.log('  ADMIN_EMAIL=admin@example.com');
    console.log('  ADMIN_PASSWORD=your-secure-password');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: ADMIN_PASSWORD must be at least 8 characters');
    process.exit(1);
  }

  console.log('Seeding admin user...\n');

  try {
    // Check if user already exists
    const existing = await sql`
      SELECT id, email FROM users WHERE email = ${email} LIMIT 1
    `;

    if (existing.rows.length > 0) {
      console.log(`User with email "${email}" already exists (id: ${existing.rows[0].id})`);
      console.log('To reset password, use: npx tsx scripts/reset-password.ts');
      process.exit(0);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create admin user
    const result = await sql`
      INSERT INTO users (email, password_hash, name, role, is_active)
      VALUES (${email}, ${passwordHash}, ${name}, 'admin', true)
      RETURNING id, email, name, role
    `;

    const user = result.rows[0];
    console.log('Admin user created successfully!');
    console.log('');
    console.log('  ID:', user.id);
    console.log('  Email:', user.email);
    console.log('  Name:', user.name);
    console.log('  Role:', user.role);
    console.log('');
    console.log('You can now log in at /login with your email and password.');
  } catch (error: any) {
    console.error('Error seeding admin user:', error.message);
    process.exit(1);
  }
}

seedAdmin();
