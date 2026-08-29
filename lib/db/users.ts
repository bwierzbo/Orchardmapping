import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';

/**
 * User roles
 */
export type UserRole = 'admin' | 'operator' | 'viewer';

/**
 * User database interface
 */
export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string | null;
  role: UserRole;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * User without sensitive data (for API responses)
 */
export interface SafeUser {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

/**
 * Data for creating a new user
 */
export interface CreateUserData {
  email: string;
  password: string;
  name?: string;
  role?: UserRole;
}

/**
 * Data for updating a user
 */
export interface UpdateUserData {
  email?: string;
  name?: string;
  role?: UserRole;
  is_active?: boolean;
  password?: string;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Compare a password with a hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Convert database row to SafeUser (excludes password_hash)
 */
function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    is_active: user.is_active,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
  };
}

/**
 * Find a user by email
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  try {
    const result = await sql`
      SELECT * FROM users WHERE email = ${email} LIMIT 1
    `;
    return result.rows.length > 0 ? (result.rows[0] as User) : null;
  } catch (error) {
    console.error('Error finding user by email:', error);
    return null;
  }
}

/**
 * Find a user by ID
 */
export async function findUserById(id: number): Promise<User | null> {
  try {
    const result = await sql`
      SELECT * FROM users WHERE id = ${id} LIMIT 1
    `;
    return result.rows.length > 0 ? (result.rows[0] as User) : null;
  } catch (error) {
    console.error('Error finding user by id:', error);
    return null;
  }
}

/**
 * Get all users (safe, without passwords)
 */
export async function getAllUsers(): Promise<SafeUser[]> {
  try {
    const result = await sql`
      SELECT id, email, name, role, is_active, last_login_at, created_at
      FROM users
      ORDER BY created_at DESC
    `;
    return result.rows as SafeUser[];
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}

/**
 * Create a new user
 */
export async function createUser(data: CreateUserData): Promise<SafeUser> {
  const passwordHash = await hashPassword(data.password);

  const result = await sql`
    INSERT INTO users (email, password_hash, name, role)
    VALUES (${data.email}, ${passwordHash}, ${data.name || null}, ${data.role || 'viewer'})
    RETURNING id, email, name, role, is_active, last_login_at, created_at
  `;

  if (result.rows.length === 0) {
    throw new Error('Failed to create user');
  }

  return result.rows[0] as SafeUser;
}

/**
 * Update a user
 */
export async function updateUser(id: number, data: UpdateUserData): Promise<SafeUser | null> {
  try {
    // Build update fields dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(data.email);
    }
    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(data.role);
    }
    if (data.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.is_active);
    }
    if (data.password !== undefined) {
      const passwordHash = await hashPassword(data.password);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(passwordHash);
    }

    if (updates.length === 0) {
      return null;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, email, name, role, is_active, last_login_at, created_at
    `;

    const client = await sql.connect();
    try {
      const result = await client.query(query, values);
      return result.rows.length > 0 ? (result.rows[0] as SafeUser) : null;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
}

/**
 * Update user's last login timestamp
 */
export async function updateLastLogin(id: number): Promise<void> {
  try {
    await sql`
      UPDATE users
      SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `;
  } catch (error) {
    console.error('Error updating last login:', error);
  }
}

/**
 * Delete a user
 */
export async function deleteUser(id: number): Promise<boolean> {
  try {
    const result = await sql`
      DELETE FROM users WHERE id = ${id}
    `;
    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error('Error deleting user:', error);
    return false;
  }
}

/**
 * Check if any users exist in the database
 */
export async function hasUsers(): Promise<boolean> {
  try {
    const result = await sql`
      SELECT COUNT(*) as count FROM users
    `;
    return parseInt(result.rows[0].count, 10) > 0;
  } catch (error) {
    console.error('Error checking users:', error);
    return false;
  }
}

/**
 * Validate user credentials and return user if valid
 */
export async function validateCredentials(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email);

  if (!user) {
    return null;
  }

  if (!user.is_active) {
    return null;
  }

  const isValid = await comparePassword(password, user.password_hash);

  if (!isValid) {
    return null;
  }

  // Update last login
  await updateLastLogin(user.id);

  return user;
}
