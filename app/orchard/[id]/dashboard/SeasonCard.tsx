import { Snowflake, Thermometer } from 'lucide-react';
import { chillSeasonWindow } from '@/lib/chill';
import { buildSeasonSummary } from '@/lib/weather-summary';
import {
  ensureWeatherCurrent,
  getHours,
  latestHourTs,
  priorSeasonAggregates,
} from '@/lib/db/weather';
import { nowLocalIso } from '@/lib/openmeteo';

/**
 * Server-rendered chill + degree-day season card. Tops up recent hours
 * from Open-Meteo when stale, then computes everything from the DB.
 * Renders nothing when the orchard has no weather history yet (run
 * scripts/backfill-weather.ts once per orchard).
 */
export default async function SeasonCard({
  orchardId,
  lat,
  lng,
}: {
  orchardId: string;
  lat: number;
  lng: number;
}) {
  await ensureWeatherCurrent(orchardId, lat, lng);

  const asOf = nowLocalIso().slice(0, 10);
  const window = chillSeasonWindow(asOf);
  const [chillWindowHours, yearHours, prior, dataThrough] = await Promise.all([
    getHours(orchardId, window.start, window.end),
    getHours(orchardId, `${asOf.slice(0, 4)}-01-01`, asOf),
    priorSeasonAggregates(orchardId, asOf),
    latestHourTs(orchardId),
  ]);

  if (!dataThrough) return null;

  const s = buildSeasonSummary({
    asOfYmd: asOf,
    chillWindowHours,
    yearHours,
    avgChillHours: prior.avgChillHours,
    avgGdd: prior.avgGdd,
    priorYears: prior.priorYears,
    dataThrough,
  });

  const fmt = (n: number) => Math.round(n).toLocaleString();

  return (
    <section className="bg-surface border border-line rounded-lg shadow-xs p-5">
      <p className="survey-caption">Season · Weather</p>
      <h2 className="text-lg font-semibold text-ink mt-1 mb-4">Chill &amp; heat accumulation</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="font-mono text-xl text-ink flex items-baseline gap-1.5">
            <Snowflake aria-hidden size={14} className="text-canopy-600 shrink-0 self-center" />
            {s.chill.portions.toFixed(1)}
          </p>
          <p className="survey-caption mt-0.5">Chill portions (Dynamic)</p>
          <p className="text-[11px] text-bark mt-0.5">
            {s.chill.seasonLabel} season{s.chill.complete ? ' · complete' : ''}
          </p>
        </div>
        <div>
          <p className="font-mono text-xl text-ink">{fmt(s.chill.hours)}</p>
          <p className="survey-caption mt-0.5">Chill hours (32–45°F)</p>
          {s.chill.avgHours != null && (
            <p className="text-[11px] text-bark mt-0.5">
              avg {fmt(s.chill.avgHours)} ({s.priorYears} yr)
            </p>
          )}
        </div>
        <div>
          <p className="font-mono text-xl text-ink flex items-baseline gap-1.5">
            <Thermometer aria-hidden size={14} className="text-flag-600 shrink-0 self-center" />
            {fmt(s.gdd.value)}
          </p>
          <p className="survey-caption mt-0.5">GDD₅₀ since Jan 1</p>
          {s.gdd.avgValue != null && (
            <p className="text-[11px] text-bark mt-0.5">
              avg {fmt(s.gdd.avgValue)} ({s.priorYears} yr)
            </p>
          )}
        </div>
        <div>
          <ul className="space-y-1">
            {s.milestones.map((m) => (
              <li key={m.dd} className="text-[12px] leading-tight">
                <span className={m.date ? 'text-ink' : 'text-bark'}>
                  {m.label} ({m.dd} DD)
                </span>{' '}
                <span className="font-mono text-bark">{m.date ?? '—'}</span>
              </li>
            ))}
          </ul>
          <p className="survey-caption mt-1">Codling moth (no-biofix)</p>
        </div>
      </div>

      <p className="survey-caption mt-4">
        Local hourly data (Open-Meteo) through {dataThrough.replace('T', ' ')}
      </p>
    </section>
  );
}
