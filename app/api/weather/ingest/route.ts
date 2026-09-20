import { NextRequest, NextResponse } from 'next/server';
import { insertHours } from '@/lib/db/weather';
import { registerOnsiteSource } from '@/lib/db/weather-sources';
import { parseStationReadings } from '@/lib/station-ingest';
import { handleApiError } from '@/lib/api-errors';

/**
 * POST /api/weather/ingest
 *
 * Where a weather station at the orchard puts its readings.
 *
 * Consumer stations — Ecowitt, Ambient — support a "custom upload" that
 * POSTs to a URL of your choosing every minute or so, which is why this
 * exists as an open endpoint rather than something polled. It takes a
 * shared token rather than a session, because a weather station cannot
 * sign in.
 *
 * Readings land with source 'onsite', which outranks every other source
 * in lib/weather-source.ts — including, importantly, leaf wetness,
 * where an on-site sensor is the only thing allowed to fill the field a
 * scab model reads. Neither AgWeatherNet station near this orchard
 * carries that sensor, and Open-Meteo's is a modelled dew probability
 * that reads 6% on a rainy day here.
 *
 * Nothing is deleted or overwritten by this: gridded hours stay beside
 * the station's, so the two can be compared rather than one quietly
 * replacing the other.
 */
export async function POST(request: NextRequest) {
  try {
    const token = process.env.WEATHER_INGEST_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: 'Station ingest is not configured. Set WEATHER_INGEST_TOKEN.' },
        { status: 503 }
      );
    }
    const provided =
      request.headers.get('x-ingest-token') ??
      request.nextUrl.searchParams.get('token') ??
      '';
    if (provided !== token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as unknown;
    const parsed = parseStationReadings(body);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { orchardId, hours, measuresLeafWetness } = parsed;

    await registerOnsiteSource(orchardId, measuresLeafWetness);
    const written = await insertHours(orchardId, hours, 'onsite');

    return NextResponse.json({
      orchardId,
      hoursReceived: hours.length,
      rowsWritten: written,
      leafWetness: measuresLeafWetness ? 'measured' : 'absent',
    });
  } catch (error) {
    return handleApiError(error, 'POST /api/weather/ingest');
  }
}
