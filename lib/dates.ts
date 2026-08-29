/**
 * Date helpers for DATE-typed fields.
 *
 * Postgres DATE columns are parsed by the driver into a Date at LOCAL
 * midnight, so formatting must use local components. The old
 * `toISOString().split('T')[0]` approach shifted dates by a day in
 * western timezones — never use it for calendar dates.
 */

/** Format a Date's local calendar day as 'YYYY-MM-DD'. */
export function dateToYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Normalize a DB date value (Date | string | null) to 'YYYY-MM-DD' or null. */
export function toYMD(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return dateToYMD(value);
  // Already a string: keep the calendar-day prefix
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : value;
}

/** Human display for a 'YYYY-MM-DD' string without timezone conversion. */
export function formatYMD(ymd: string | null | undefined): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
