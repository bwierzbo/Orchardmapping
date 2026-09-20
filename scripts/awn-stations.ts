import { config } from 'dotenv';
config({ path: '.env.local' });

/**
 * Which AgWeatherNet stations are near this orchard, and do any of them
 * measure leaf wetness?
 *
 *   npx tsx scripts/awn-stations.ts [orchard-id]
 *
 * That second question is the one that matters. The scab model infers
 * wetness from rain and humidity because Open-Meteo's modelled
 * leaf-wetness probability tracks dew rather than rain. An AgWeatherNet
 * station reporting LW_UNITY — 0 to 1, with 0.4 defined as wet — is a
 * measurement, and would replace the inference outright.
 *
 * The network is 160+ stations but weighted heavily to irrigated
 * eastern Washington, so a usable station on the Olympic Peninsula is
 * genuinely uncertain. Distance matters more here than almost anywhere:
 * a station across the Elwha is a different climate from the bluff.
 *
 * Credentials come from .env.local, never from the command line:
 *   AGWEATHERNET_USERNAME, AGWEATHERNET_PASSWORD
 */

import { sql } from '@vercel/postgres';

const BASE = 'https://weather.wsu.edu/webservice';
const ORCHARD = process.argv[2] ?? 'finn-hall';

function credentials(): { username: string; password: string } | null {
  const username = process.env.AGWEATHERNET_USERNAME;
  const password = process.env.AGWEATHERNET_PASSWORD;
  if (!username || !password || username === '…') return null;
  return { username, password };
}

/** Great-circle distance in miles. */
function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const p = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * p) / 2) ** 2 +
    Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lng2 - lng1) * p) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(a));
}

async function post(endpoint: string, body: Record<string, string>) {
  const res = await fetch(`${BASE}/${endpoint}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`AgWeatherNet ${endpoint}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const creds = credentials();
  if (!creds) {
    console.log('No AgWeatherNet credentials found.\n');
    console.log('Add these two lines to .env.local (gitignored), then re-run:');
    console.log('  AGWEATHERNET_USERNAME=your-username');
    console.log('  AGWEATHERNET_PASSWORD=your-password\n');
    console.log('API access is granted separately from registration —');
    console.log('email weather@wsu.edu if you have not already.');
    process.exit(2);
  }

  const { rows } = await sql`
    SELECT center_lat::float AS lat, center_lng::float AS lng, name
    FROM orchards WHERE id = ${ORCHARD}`;
  if (!rows[0]) throw new Error(`No orchard ${ORCHARD}`);
  const { lat, lng, name } = rows[0];
  console.log(`${name}  (${lat.toFixed(4)}, ${lng.toFixed(4)})\n`);

  // metadata() returns every station the account can see; filtering on
  // LW=Y asks only for those carrying a leaf wetness sensor.
  const all = await post('metadata', { ...creds, STATE: 'WA' });
  const withLw = await post('metadata', { ...creds, STATE: 'WA', LW: 'Y' });

  const list = (r: unknown): Record<string, unknown>[] => {
    const d = r as { DATA?: unknown[]; data?: unknown[] };
    return (d.DATA ?? d.data ?? []) as Record<string, unknown>[];
  };
  const lwIds = new Set(list(withLw).map((s) => String(s.STATION_ID)));

  const near = list(all)
    .map((s) => ({
      id: String(s.STATION_ID),
      name: String(s.STATION_NAME ?? ''),
      county: String(s.COUNTY ?? ''),
      lat: Number(s.LATITUDE_DEGREE),
      lng: Number(s.LONGITUDE_DEGREE),
      elevation: Number(s.ELEVATION_FEET ?? 0),
      installed: String(s.INSTALLATION_DATE ?? ''),
      leafWetness: lwIds.has(String(s.STATION_ID)),
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s) => ({ ...s, miles: milesBetween(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.miles - b.miles);

  console.log(`${list(all).length} stations visible, ${lwIds.size} with a leaf wetness sensor\n`);
  console.log('Nearest ten:');
  console.log('  miles  LW   county          elev   station');
  for (const s of near.slice(0, 10)) {
    console.log(
      `  ${s.miles.toFixed(1).padStart(5)}  ${s.leafWetness ? 'YES' : ' - '}  ` +
      `${s.county.padEnd(14)}  ${String(s.elevation).padStart(5)}  ${s.name} (${s.id})`
    );
  }

  const bestLw = near.find((s) => s.leafWetness);
  console.log('\nVerdict:');
  if (!near.length) {
    console.log('  No stations returned — check that API access has been enabled.');
  } else if (bestLw && bestLw.miles <= 25) {
    console.log(`  ${bestLw.name} is ${bestLw.miles.toFixed(1)} mi away WITH leaf wetness.`);
    console.log('  Worth wiring up — that replaces the inferred wetness in the scab model.');
  } else if (bestLw) {
    console.log(`  Nearest leaf-wetness station is ${bestLw.name}, ${bestLw.miles.toFixed(1)} mi away.`);
    console.log('  Probably too far to trust in a rain shadow — compare it against');
    console.log('  Open-Meteo for a season before switching anything over.');
  } else {
    console.log('  No leaf-wetness station in range. Station air temperature may still');
    console.log('  beat gridded data for degree days, but the scab model gains nothing.');
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
