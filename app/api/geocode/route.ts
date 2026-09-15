import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';

/**
 * GET /api/geocode?q=<address>
 *
 * Address search for the add-an-orchard flow, best match first as
 * { results: [{ label, lat, lng }] }. Two free services queried in
 * parallel because they fail differently on rural addresses:
 *
 * - US Census geocoder: exact house numbers on US rural roads
 *   (Nominatim has none out here), listed first.
 * - OSM Nominatim: roads, towns, and non-US or fuzzy queries. Usage
 *   policy wants an identifying User-Agent and low volume — an
 *   occasional lookup here qualifies.
 */

interface Hit {
  label: string;
  lat: number;
  lng: number;
}

async function censusSearch(q: string): Promise<Hit[]> {
  const url =
    'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=' +
    encodeURIComponent(q);
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const body = (await res.json()) as {
    result?: {
      addressMatches?: Array<{
        matchedAddress?: string;
        coordinates?: { x?: number; y?: number };
      }>;
    };
  };
  return (body.result?.addressMatches ?? [])
    .map((m) => ({
      label: m.matchedAddress ?? '',
      lat: Number(m.coordinates?.y),
      lng: Number(m.coordinates?.x),
    }))
    .filter((r) => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

async function nominatimSearch(q: string): Promise<Hit[]> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=' +
    encodeURIComponent(q);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'OrchardMap (orchardmapping.vercel.app)',
      Accept: 'application/json',
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as Array<{
    display_name?: string;
    lat?: string;
    lon?: string;
  }>;
  return body
    .map((r) => ({
      label: r.display_name ?? '',
      lat: Number(r.lat),
      lng: Number(r.lon),
    }))
    .filter((r) => r.label && Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

export async function GET(request: NextRequest) {
  try {
    const { response } = await requireSession();
    if (response) return response;

    const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
    if (q.length < 3) {
      return NextResponse.json({ results: [] });
    }

    // One failing service must not sink the search
    const [census, nominatim] = await Promise.all([
      censusSearch(q).catch(() => [] as Hit[]),
      nominatimSearch(q).catch(() => [] as Hit[]),
    ]);

    // Census (house-number precise) first; drop Nominatim hits that
    // duplicate one within ~250 m
    const results: Hit[] = [...census];
    for (const n of nominatim) {
      const dup = results.some(
        (r) => Math.abs(r.lat - n.lat) < 0.0022 && Math.abs(r.lng - n.lng) < 0.0033
      );
      if (!dup) results.push(n);
    }

    return NextResponse.json({ results: results.slice(0, 6) });
  } catch (error) {
    return handleApiError(error, 'GET /api/geocode');
  }
}
