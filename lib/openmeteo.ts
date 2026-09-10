import type { HourTemp } from './chill';

/**
 * Open-Meteo hourly temperature fetchers.
 *
 * Free, keyless, gridded to the orchard's lat/lng — which matters in
 * the Olympic rain shadow where the nearest airport station can be a
 * different climate. All requests ask for America/Los_Angeles local
 * time; timestamps come back as naive local ISO strings and are stored
 * that way (chill/GDD models bucket by local calendar day).
 */

const TIMEZONE = 'America/Los_Angeles';

interface OpenMeteoHourly {
  hourly?: { time?: string[]; temperature_2m?: (number | null)[] };
  reason?: string;
}

async function fetchHourly(url: string): Promise<HourTemp[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${url}`);
  const body = (await res.json()) as OpenMeteoHourly;
  const time = body.hourly?.time ?? [];
  const temp = body.hourly?.temperature_2m ?? [];
  const out: HourTemp[] = [];
  for (let i = 0; i < time.length; i++) {
    const t = temp[i];
    if (t == null) continue; // future or missing hours come back null
    out.push({ ts: time[i], tempC: t });
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
): Promise<HourTemp[]> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
    `&start_date=${startYmd}&end_date=${endYmd}` +
    `&hourly=temperature_2m&timezone=${encodeURIComponent(TIMEZONE)}`;
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
): Promise<HourTemp[]> {
  const days = Math.min(92, Math.max(1, Math.ceil(pastDays)));
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m&past_days=${days}&forecast_days=1` +
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
