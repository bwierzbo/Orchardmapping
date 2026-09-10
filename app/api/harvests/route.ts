import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { handleApiError } from '@/lib/api-errors';
import { toYMD } from '@/lib/dates';

/**
 * GET /api/harvests?orchard_id=[&year=]
 * Harvest records (newest first) with their group-action scope summary.
 */
export async function GET(request: NextRequest) {
  try {
    const orchardId = request.nextUrl.searchParams.get('orchard_id');
    if (!orchardId) {
      return NextResponse.json({ error: 'Missing orchard_id' }, { status: 400 });
    }
    const yearParam = request.nextUrl.searchParams.get('year');
    const year = yearParam ? Number(yearParam) : null;

    const { rows } = year
      ? await sql`
          SELECT h.*, ga.scope, ga.tree_count
          FROM harvests h JOIN group_actions ga ON ga.id = h.group_action_id
          WHERE h.orchard_id = ${orchardId} AND h.undone_at IS NULL
            AND EXTRACT(YEAR FROM h.harvest_date) = ${year}
          ORDER BY h.harvest_date DESC, h.id DESC`
      : await sql`
          SELECT h.*, ga.scope, ga.tree_count
          FROM harvests h JOIN group_actions ga ON ga.id = h.group_action_id
          WHERE h.orchard_id = ${orchardId} AND h.undone_at IS NULL
          ORDER BY h.harvest_date DESC, h.id DESC`;

    return NextResponse.json({
      success: true,
      harvests: rows.map((h) => ({
        id: h.id,
        harvest_date: toYMD(h.harvest_date),
        weight_lbs: h.weight_lbs !== null ? Number(h.weight_lbs) : null,
        brix: h.brix !== null ? Number(h.brix) : null,
        sg: h.sg !== null ? Number(h.sg) : null,
        ph: h.ph !== null ? Number(h.ph) : null,
        notes: h.notes,
        tree_count: h.tree_count,
        scope_summary: (h.scope as { summary?: string })?.summary ?? '',
      })),
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/harvests');
  }
}
