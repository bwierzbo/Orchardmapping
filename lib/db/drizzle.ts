import { drizzle } from 'drizzle-orm/vercel-postgres';
import { sql } from '@vercel/postgres';
import * as schema from './schema';

/**
 * Drizzle client over the same @vercel/postgres pool the raw-SQL modules
 * use — both layers share one connection source during the migration to
 * typed queries (CiderPilot-style Drizzle everywhere is the end state).
 */
export const db = drizzle(sql, { schema });

export * from './schema';
