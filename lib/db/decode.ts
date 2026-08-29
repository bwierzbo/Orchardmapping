/**
 * Row decoding helpers.
 *
 * @vercel/postgres returns DECIMAL/NUMERIC columns as strings; these
 * helpers coerce them so rows actually match their TypeScript types.
 */

export function toNum(
  val: string | number | undefined | null,
  defaultVal: number
): number {
  if (val === undefined || val === null) return defaultVal;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return Number.isNaN(num) ? defaultVal : num;
}

export function toNumOrUndefined(
  val: string | number | undefined | null
): number | undefined {
  if (val === undefined || val === null) return undefined;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return Number.isNaN(num) ? undefined : num;
}
