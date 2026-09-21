import type { HourWeather } from './weather-hour';

/**
 * Open-Meteo hourly weather fetchers.
 *
 * Free, keyless, gridded to the orchard's lat/lng — which matters in
 * the Olympic rain shadow where the nearest airport station can be a
 * different climate. Every request asks for the ORCHARD'S OWN local
 * time; timestamps come back as naive local ISO strings and are stored
 * that way (chill/GDD models bucket by local calendar day, and a wet
 * period is a run of contiguous hours, so an offset would move day
 * boundaries rather than merely relabel them).
 *
 * Precipitation and humidity ride along in the same request as
 * temperature — the disease models are wetness-driven, and asking for
 * three variables costs no more calls than asking for one.
 */

/**
 * Ask Open-Meteo which zone a coordinate is in.
 *
 * Saves carrying a timezone database for the one moment we need it — at
 * orchard creation — and it is the same service that will later be asked
 * for that orchard's weather, so the two agree by construction.
 * Returns null rather than guessing: a wrong zone is worse than an
 * absent one, because it is silent.
 */
export async function resolveTimezone(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&hourly=temperature_2m&forecast_days=1&timezone=auto`
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { timezone?: unknown };
    return typeof body.timezone === 'string' && body.timezone ? body.timezone : null;
  } catch {
    return null;
  }
}

/** The hourly variables every request asks for, in one place. */
const HOURLY_VARS =
  'temperature_2m,precipitation,relative_humidity_2m,leaf_wetness_probability';

interface OpenMeteoHourly {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    precipitation?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    leaf_wetness_probability?: (number | null)[];
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
  const wet = body.hourly?.leaf_wetness_probability ?? [];
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
      leafWetnessPct: wet[i] ?? null,
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
  endYmd: string,
  timezone: string
): Promise<HourWeather[]> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
    `&start_date=${startYmd}&end_date=${endYmd}` +
    `&hourly=${HOURLY_VARS}&timezone=${encodeURIComponent(timezone)}`;
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
  nowLocalIso: string,
  timezone: string
): Promise<HourWeather[]> {
  const days = Math.min(92, Math.max(1, Math.ceil(pastDays)));
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=${HOURLY_VARS}&past_days=${days}&forecast_days=1` +
    `&timezone=${encodeURIComponent(timezone)}`;
  const hours = await fetchHourly(url);
  return hours.filter((h) => h.ts <= nowLocalIso);
}

/**
 * Current local time in the orchard's own zone, as a naive ISO string.
 *
 * "Today" is the orchard's today: a spray recorded at 9pm in Britain
 * belongs to that day's program, not to the previous one because a
 * server in Virginia had already rolled over.
 */
export function nowLocalIso(timezone: string): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
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
