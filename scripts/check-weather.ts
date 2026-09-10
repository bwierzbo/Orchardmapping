import { config } from 'dotenv';
config({ path: '.env.local' });

/**
 * Print the computed season summary for an orchard — sanity check for
 * the weather engine.  npx tsx scripts/check-weather.ts [orchardId]
 */

import { getHours, priorSeasonAggregates, latestHourTs } from '../lib/db/weather';
import { buildSeasonSummary } from '../lib/weather-summary';
import { chillSeasonWindow } from '../lib/chill';
import { nowLocalIso } from '../lib/openmeteo';

async function main() {
  const orchardId = process.argv[2] ?? 'finn-hall';
  const asOf = nowLocalIso().slice(0, 10);
  const w = chillSeasonWindow(asOf);
  const [cw, yh, prior, latest] = await Promise.all([
    getHours(orchardId, w.start, w.end),
    getHours(orchardId, `${asOf.slice(0, 4)}-01-01`, asOf),
    priorSeasonAggregates(orchardId, asOf),
    latestHourTs(orchardId),
  ]);
  const s = buildSeasonSummary({
    asOfYmd: asOf,
    chillWindowHours: cw,
    yearHours: yh,
    avgChillHours: prior.avgChillHours,
    avgGdd: prior.avgGdd,
    priorYears: prior.priorYears,
    dataThrough: latest,
  });
  console.log(`${orchardId} as of ${asOf}`);
  console.log(JSON.stringify(s, null, 1));
  console.log('chill window rows:', cw.length, '| year rows:', yh.length);
}

main().then(() => process.exit(0));
