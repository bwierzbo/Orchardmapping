import type { HourWeather } from './weather-hour';

/**
 * Open-Meteo hourly weather fetchers.
 *
 * Free, keyless, gridded to the orchard's lat/lng — which matters in
 * the Olympic rain shadow where the nearest airport station can be a
 * different climate. All requests ask for America/Los_Angeles local
 * time; timestamps come back as naive local ISO strings and are stored
 * that way (chill/GDD models bucket by local calendar day).
 *
 * Precipitation and humidity ride along in the same request as
 * temperature — the disease models are wetness-driven, and asking for
 * three variables costs no more calls than asking for one.
 */

export const TIMEZONE = 'America/Los_Angeles';

/** The hourly variables every request asks for, in one place. */
const HOURLY_VARS = 'temperature_2m,precipitation,relative_humidity_2m';

interface OpenMeteoHourly {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    precipitation?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
  };
  reason?: string;
}

async function fetchHourly(url: string): Promise<HourWeather[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${url}`);
  const body = (await res.json()) as OpenMeteoHourly;
  const time = body.hourly?.time ?? [];
  const temp = body.hourly?.temperature_2m ?? [];
  const precip = body.hourly?.precipitation ?? [];
  const rh = body.hourly?.relative_humidity_2m ?? [];
  const out: HourWeather[] = [];
  for (let i = 0; i < time.length; i++) {
    const t = temp[i];
    if (t == null) continue; // future or missing hours come back null
    // Moisture may be absent on an archive that predates a variable, so
    // it degrades to null rather than dropping the whole hour.
    out.push({
      ts: time[i],
      tempC: t,
      precipMm: precip[i] ?? null,
      rhPct: rh[i] ?? null,
    });
  }
  return out;
}

/**
 * Historical hours from the ERA5 archive (has a ~5-day publication
 * delay — use fetchRecentHours to cover the gap up to now).
 */
export async function fetchArchiveHours(
  lat: number,
  lng: number,
  startYmd: string,
  endYmd: string
): Promise<HourWeather[]> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
    `&start_date=${startYmd}&end_date=${endYmd}` +
    `&hourly=${HOURLY_VARS}&timezone=${encodeURIComponent(TIMEZONE)}`;
  return fetchHourly(url);
}

/**
 * Recent observed hours from the forecast API's past_days window
 * (1-92 days back). Only hours at or before `nowLocalIso` are returned
 * — forecast hours are excluded.
 */
export async function fetchRecentHours(
  lat: number,
  lng: number,
  pastDays: number,
  nowLocalIso: string
): Promise<HourWeather[]> {
  const days = Math.min(92, Math.max(1, Math.ceil(pastDays)));
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=${HOURLY_VARS}&past_days=${days}&forecast_days=1` +
    `&timezone=${encodeURIComponent(TIMEZONE)}`;
  const hours = await fetchHourly(url);
  return hours.filter((h) => h.ts <= nowLocalIso);
}

/** Current local time in the orchard timezone as a naive ISO string. */
export function nowLocalIso(): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  // sv-SE renders as "YYYY-MM-DD HH:mm"
  return parts.replace(' ', 'T');
}
