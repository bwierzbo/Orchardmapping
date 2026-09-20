import type { HourWeather } from './weather-hour';
import { infectionPeriods, type InfectionSeverity, type WetPeriod } from './scab';

/**
 * Where a better model, or better weather, plugs in.
 *
 * Two seams, deliberately separate, because they fail independently:
 *
 *   A WEATHER SOURCE supplies the hours. Today that is Open-Meteo on a
 *   9-25 km grid, which smooths the very rain-shadow gradient this site
 *   sits in, and whose leaf wetness is modelled rather than measured.
 *   An AgWeatherNet station or an on-site logger would replace it
 *   without the models noticing.
 *
 *   A DISEASE MODEL turns hours into infection events. Today that is
 *   the revised Mills table in lib/scab.ts. RIMpro and NEWA additionally
 *   model ascospore maturity and discharge — how many spores are
 *   actually airborne — and score events on that basis, which is
 *   strictly better than asking only whether conditions were sufficient.
 *
 * NOTHING EXTERNAL IS IMPLEMENTED. These are interfaces and a local
 * implementation, so that adopting a provider later is a registration
 * rather than a rewrite. Writing the seam now costs little; discovering
 * it is needed after the model is welded into the resolver costs a lot.
 */

export interface InfectionEvent {
  /** Local "YYYY-MM-DDTHH:mm". */
  startTs: string;
  endTs: string;
  severity: InfectionSeverity;
  /** Hours of leaf wetness, where the provider reports them. */
  wetHours: number | null;
  meanTempF: number | null;
  /**
   * Provider-native severity score where one exists — RIMpro's RIM
   * value, NEWA's percent ascospore discharge. Null for Mills, which
   * has no such number, and a UI must not invent one.
   */
  score: number | null;
  /** Which provider produced this, for display and for trust. */
  source: string;
}

export interface ScabModelProvider {
  /** Stable key, e.g. "mills-local", "rimpro". */
  key: string;
  /** Shown beside results so a reading is never anonymous. */
  label: string;
  /**
   * True when the provider models ascospore availability, not merely
   * whether conditions allowed infection. A UI should say which it is.
   */
  modelsAscospores: boolean;
  infectionEvents(
    hours: readonly HourWeather[],
    minSeverity: Exclude<InfectionSeverity, 'none'>
  ): Promise<InfectionEvent[]>;
}

/** The revised Mills table over stored hours. No network, no key. */
export const millsProvider: ScabModelProvider = {
  key: 'mills-local',
  label: 'Mills (local)',
  modelsAscospores: false,
  async infectionEvents(hours, minSeverity) {
    return infectionPeriods(hours, minSeverity).map(toEvent);
  },
};

function toEvent(p: WetPeriod): InfectionEvent {
  return {
    startTs: p.startTs,
    endTs: p.endTs,
    severity: p.severity,
    wetHours: p.wetHours,
    meanTempF: p.meanTempF,
    score: null,
    source: millsProvider.key,
  };
}

const PROVIDERS = new Map<string, ScabModelProvider>([[millsProvider.key, millsProvider]]);

/** Register an external provider. Nothing does this yet. */
export function registerScabProvider(provider: ScabModelProvider): void {
  PROVIDERS.set(provider.key, provider);
}

/** The provider for a key, falling back to the local Mills model. */
export function scabProvider(key?: string | null): ScabModelProvider {
  return (key && PROVIDERS.get(key)) || millsProvider;
}

export function listScabProviders(): ScabModelProvider[] {
  return [...PROVIDERS.values()];
}

/**
 * A source of hourly weather for one orchard.
 *
 * Implemented today by Open-Meteo through lib/db/weather.ts. An
 * AgWeatherNet implementation would fetch 15-minute observations from
 * weather.wsu.edu/webservice/ (endpoints metadata, stationdata,
 * stationlocator; username/password auth granted by weather@wsu.edu),
 * average them to the hour, and write the same rows — with LW_UNITY as
 * a MEASURED leaf wetness, where 0.4 is defined as wet, in place of the
 * modelled probability that lib/scab.ts currently declines to trust.
 */
export interface WeatherSource {
  key: string;
  label: string;
  /** True when leaf wetness is measured rather than inferred. */
  measuresLeafWetness: boolean;
  hours(orchardId: string, startYmd: string, endYmd: string): Promise<HourWeather[]>;
}
