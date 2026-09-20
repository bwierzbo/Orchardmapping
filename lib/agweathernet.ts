import type { HourWeather } from './weather-hour';

/**
 * WSU AgWeatherNet (weather.wsu.edu).
 *
 * Station weather for Washington, free with an account — but note that
 * registering on the website and having API access enabled are two
 * different things; the second is granted by emailing weather@wsu.edu.
 *
 * For this orchard the relevant station is Sequim: 3.5 miles away at
 * essentially the same elevation (131 ft against the orchard's 138),
 * which makes it a good proxy for temperature, humidity and dew point.
 * Port Angeles is 10.5 miles the other way and 180 ft higher, on the
 * wet side of the rain shadow, and is useful mainly as the other end of
 * a bracket.
 *
 * NEITHER carries a leaf wetness sensor. The API exposes LW_UNITY —
 * 0 to 1, with 0.4 defined as wet — for stations that do, and this
 * client reads it where present, so an orchard served by such a station
 * gets measured wetness without any further work.
 *
 * Observations arrive at 15-minute resolution and are averaged to the
 * hour here, except rainfall, which is summed.
 */

const BASE = 'https://weather.wsu.edu/webservice';

export interface AwnCredentials {
  username: string;
  password: string;
}

export function awnCredentialsFromEnv(): AwnCredentials | null {
  const username = process.env.AGWEATHERNET_USERNAME;
  const password = process.env.AGWEATHERNET_PASSWORD;
  if (!username || !password || username === '…') return null;
  return { username, password };
}

export interface AwnStation {
  stationId: string;
  name: string;
  county: string;
  lat: number;
  lng: number;
  elevationFt: number;
  installedOn: string | null;
  /** True when the station carries a leaf wetness sensor. */
  leafWetness: boolean;
}

async function post(
  endpoint: string,
  creds: AwnCredentials,
  params: Record<string, string> = {}
): Promise<unknown> {
  const res = await fetch(`${BASE}/${endpoint}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...creds, ...params }),
    signal: AbortSignal.timeout(45_000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'AgWeatherNet rejected the credentials. Registering on the website and ' +
        'having API access enabled are separate — email weather@wsu.edu.'
    );
  }
  if (!res.ok) throw new Error(`AgWeatherNet ${endpoint}: HTTP ${res.status}`);
  return res.json();
}

/** The DATA array, whichever casing the endpoint used. */
function rowsOf(payload: unknown): Record<string, unknown>[] {
  const p = payload as { DATA?: unknown; data?: unknown };
  const d = p?.DATA ?? p?.data ?? [];
  return Array.isArray(d) ? (d as Record<string, unknown>[]) : [];
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === 'NA' || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Stations visible to this account, optionally only those with a sensor. */
export async function listStations(
  creds: AwnCredentials,
  options: { state?: string; leafWetnessOnly?: boolean } = {}
): Promise<AwnStation[]> {
  const params: Record<string, string> = { STATE: options.state ?? 'WA' };
  if (options.leafWetnessOnly) params.LW = 'Y';
  const lwIds = options.leafWetnessOnly
    ? null
    : new Set(
        rowsOf(await post('metadata', creds, { STATE: params.STATE, LW: 'Y' })).map((s) =>
          String(s.STATION_ID)
        )
      );
  return rowsOf(await post('metadata', creds, params))
    .map((s) => ({
      stationId: String(s.STATION_ID),
      name: String(s.STATION_NAME ?? ''),
      county: String(s.COUNTY ?? ''),
      lat: num(s.LATITUDE_DEGREE) ?? NaN,
      lng: num(s.LONGITUDE_DEGREE) ?? NaN,
      elevationFt: num(s.ELEVATION_FEET) ?? 0,
      installedOn: s.INSTALLATION_DATE ? String(s.INSTALLATION_DATE) : null,
      leafWetness: lwIds ? lwIds.has(String(s.STATION_ID)) : true,
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}

/** Great-circle distance in miles. */
export function milesBetween(
  lat1: number, lng1: number, lat2: number, lng2: number
): number {
  const p = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * p) / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lng2 - lng1) * p) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(a));
}

/**
 * Fold 15-minute observations into hours.
 *
 * Temperature and humidity average; rainfall sums, because four
 * quarter-hour totals are an hour's rain and their mean is a quarter of
 * it. Leaf wetness averages its unity value and is scaled to 0-100 to
 * match the column, where 0.4 unity — the defined wet point — becomes
 * 40. The scab model's own threshold is applied later, not here.
 */
export function foldToHours(rows: Record<string, unknown>[]): HourWeather[] {
  const buckets = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const raw = String(r.Datetime ?? r.DATETIME ?? r.datetime ?? '');
    if (!raw) continue;
    // "YYYY-MM-DD HH:mm:ss" or ISO — keep the local hour either way
    const ts = `${raw.slice(0, 10)}T${raw.slice(11, 13)}:00`;
    const list = buckets.get(ts);
    if (list) list.push(r);
    else buckets.set(ts, [r]);
  }

  const mean = (xs: (number | null)[]): number | null => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const sum = (xs: (number | null)[]): number | null => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };

  return [...buckets.keys()].sort().flatMap((ts) => {
    const rs = buckets.get(ts)!;
    const tempF = mean(rs.map((r) => num(r.AT_F)));
    if (tempF === null) return [];
    const precipIn = sum(rs.map((r) => num(r.PRECIP_IN)));
    const lwUnity = mean(rs.map((r) => num(r.LW_UNITIY) ?? num(r.LW_UNITY)));
    return [{
      ts,
      tempC: ((tempF - 32) * 5) / 9,
      precipMm: precipIn === null ? null : precipIn * 25.4,
      rhPct: mean(rs.map((r) => num(r.RELATIVE_HUMIDITY) ?? num(r.RH_PERCENT))),
      leafWetnessPct: lwUnity === null ? null : lwUnity * 100,
    }];
  });
}

/** Hourly weather for a station over a local date range. */
export async function stationHours(
  creds: AwnCredentials,
  stationId: string,
  startYmd: string,
  endYmd: string
): Promise<HourWeather[]> {
  const payload = await post('stationdata', creds, {
    STATION_ID: stationId,
    START: `${startYmd} 00:00`,
    END: `${endYmd} 23:59`,
  });
  // stationdata nests observations under each station's DATA
  const top = rowsOf(payload);
  const obs = top.length && top[0].DATA ? rowsOf(top[0]) : top;
  return foldToHours(obs as Record<string, unknown>[]);
}
