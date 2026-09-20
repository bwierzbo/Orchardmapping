import { sql } from '@vercel/postgres';

/**
 * Registering where an orchard's weather comes from.
 *
 * Priorities are fixed rather than user-chosen, because the ordering is
 * a statement about measurement quality and not a preference: a sensor
 * at the orchard beats a station three miles away, which beats a value
 * interpolated between two stations, which beats a grid cell that gives
 * this orchard and Sequim the same rainfall.
 */

export const SOURCE_PRIORITY = {
  onsite: 10,
  station: 20,
  interpolated: 30,
  gridded: 90,
} as const;

/**
 * Record that an orchard has its own station. Called on first ingest,
 * so plugging a station in is the only step — nothing to configure.
 *
 * measuresLeafWetness is not cosmetic: it is what allows this source to
 * fill the leaf wetness field at all, and it is re-asserted on every
 * ingest so that adding the sensor later takes effect immediately.
 */
export async function registerOnsiteSource(
  orchardId: string,
  measuresLeafWetness: boolean
): Promise<void> {
  await sql`
    INSERT INTO weather_sources
      (orchard_id, source, kind, label, priority, measures_leaf_wetness, notes)
    VALUES (
      ${orchardId}, 'onsite', 'onsite', 'Orchard station',
      ${SOURCE_PRIORITY.onsite}, ${measuresLeafWetness},
      'Readings posted by a station at the orchard. Outranks every other source; the only one permitted to supply measured leaf wetness.'
    )
    ON CONFLICT (orchard_id, source) DO UPDATE SET
      measures_leaf_wetness = EXCLUDED.measures_leaf_wetness,
      updated_at = NOW()
  `;
}

/** Record a nearby AgWeatherNet station as a source for an orchard. */
export async function registerStationSource(input: {
  orchardId: string;
  stationId: string;
  label: string;
  lat: number;
  lng: number;
  distanceMiles: number;
  measuresLeafWetness: boolean;
  notes?: string;
}): Promise<void> {
  await sql`
    INSERT INTO weather_sources
      (orchard_id, source, kind, label, priority, station_id, lat, lng,
       distance_miles, measures_leaf_wetness, notes)
    VALUES (
      ${input.orchardId}, ${`awn:${input.stationId}`}, 'station', ${input.label},
      ${SOURCE_PRIORITY.station}, ${input.stationId}, ${input.lat}, ${input.lng},
      ${input.distanceMiles}, ${input.measuresLeafWetness}, ${input.notes ?? null}
    )
    ON CONFLICT (orchard_id, source) DO UPDATE SET
      label = EXCLUDED.label,
      distance_miles = EXCLUDED.distance_miles,
      measures_leaf_wetness = EXCLUDED.measures_leaf_wetness,
      notes = EXCLUDED.notes,
      updated_at = NOW()
  `;
}
