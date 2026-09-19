import type { HourTemp } from './chill';

/**
 * One stored hour of orchard weather.
 *
 * The chill and degree-day models only ever need `{ ts, tempC }` — that
 * narrow shape stays `HourTemp` in chill.ts, and this type is
 * structurally assignable to it, so those models keep their minimal
 * contract while storage carries everything Open-Meteo returns.
 *
 * Moisture is nullable because every row backfilled before migration
 * 023 has temperature only.
 */
export interface HourWeather extends HourTemp {
  /** Precipitation over the hour, mm. */
  precipMm: number | null;
  /** Relative humidity at the end of the hour, %. */
  rhPct: number | null;
}

/** True when the hour carries the moisture fields a wetness model needs. */
export function hasMoisture(hour: HourWeather): boolean {
  return hour.precipMm !== null && hour.rhPct !== null;
}
