import { sql } from '@vercel/postgres';

/** Read one settings key's JSONB value (null when unset). */
export async function getSetting(key: string): Promise<unknown> {
  const { rows } = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
  return rows[0]?.value ?? null;
}

/** Upsert one settings key. */
export async function putSetting(
  key: string,
  value: unknown,
  updatedBy?: string
): Promise<void> {
  await sql`
    INSERT INTO app_settings (key, value, updated_at, updated_by)
    VALUES (${key}, ${JSON.stringify(value)}, NOW(), ${updatedBy ?? null})
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by
  `;
}
