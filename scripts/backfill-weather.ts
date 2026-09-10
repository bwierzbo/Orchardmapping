import { config } from 'dotenv';
config({ path: '.env.local' });

/**
 * One-time (idempotent) backfill of hourly temperatures for every
 * orchard, from START_YMD through the ERA5 archive horizon, then
 * topped up to now via the forecast API's past_days window.
 *
 *   npx tsx scripts/backfill-weather.ts [start=2021-01-01]
 */

import { sql } from '@vercel/postgres';
import { fetchArchiveHours, fetchRecentHours, nowLocalIso } from '../lib/openmeteo';
import { insertHours, latestHourTs } from '../lib/db/weather';

const START_YMD = process.argv[2] ?? '2021-01-01';
const ARCHIVE_LAG_DAYS = 7; // ERA5 publishes with a ~5-day delay

async function main() {
  const { rows: orchards } = await sql`
    SELECT id, name, center_lat::float AS lat, center_lng::float AS lng FROM orchards
  `;
  const now = nowLocalIso();
  const today = now.slice(0, 10);
  const archiveEnd = new Date(Date.parse(`${today}T00:00:00Z`) - ARCHIVE_LAG_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  for (const o of orchards) {
    if (o.lat == null || o.lng == null) {
      console.log(`- ${o.id}: no center coordinates, skipping`);
      continue;
    }
    const existing = await latestHourTs(o.id as string);
    const start = existing && existing.slice(0, 10) > START_YMD ? existing.slice(0, 10) : START_YMD;
    console.log(`- ${o.id} (${o.name}): archive ${start} → ${archiveEnd}`);

    // Archive in ≤2-year chunks to keep responses modest
    let chunkStart = start;
    let total = 0;
    while (chunkStart <= archiveEnd) {
      const endYear = Math.min(Number(chunkStart.slice(0, 4)) + 1, Number(archiveEnd.slice(0, 4)));
      const chunkEnd = `${endYear}-12-31` < archiveEnd ? `${endYear}-12-31` : archiveEnd;
      const hours = await fetchArchiveHours(o.lat, o.lng, chunkStart, chunkEnd);
      const inserted = await insertHours(o.id as string, hours);
      total += inserted;
      console.log(`    ${chunkStart} → ${chunkEnd}: ${hours.length} hours fetched, ${inserted} new`);
      chunkStart = `${endYear + 1}-01-01`;
    }

    // Bridge the archive lag with recent observed hours
    const recent = await fetchRecentHours(o.lat, o.lng, ARCHIVE_LAG_DAYS + 2, now);
    const recentInserted = await insertHours(o.id as string, recent);
    total += recentInserted;
    console.log(`    recent top-up: ${recentInserted} new · total ${total} rows inserted`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
