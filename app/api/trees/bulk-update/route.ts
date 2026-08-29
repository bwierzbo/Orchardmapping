import { NextRequest, NextResponse } from 'next/server';
import { requireSession, WRITER_ROLES } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import { bulkUpsertTrees, BulkUpsertRow } from '@/lib/db/trees';
import { orchardExists } from '@/lib/db/orchards';
import { validateBulkImport, formatValidationErrors, TreeRowData } from '@/lib/tree-validation';

/**
 * POST /api/trees/bulk-update
 * Bulk upsert trees from CSV data: creates rows that don't exist and
 * updates ones that do, all in a single transaction.
 * Requires operator/admin.
 *
 * Body format:
 * {
 *   orchard_id: "washington",
 *   updates: [
 *     { row_id: "1", position: 1, variety: "Fuji", status: "healthy" },
 *     { row_id: "1", position: 2, variety: "Gala", status: "stressed" }
 *   ]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { response } = await requireSession(WRITER_ROLES);
    if (response) return response;

    const body = await request.json();
    const { orchard_id, updates } = body;

    if (!orchard_id || typeof orchard_id !== 'string') {
      return NextResponse.json(
        { error: 'Missing required field', details: 'orchard_id is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: 'Invalid updates', details: 'updates must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!(await orchardExists(orchard_id))) {
      return NextResponse.json(
        { error: `Orchard "${orchard_id}" does not exist` },
        { status: 404 }
      );
    }

    // Validate every row before touching the database
    const validation = validateBulkImport(updates as TreeRowData[]);
    if (!validation.isValid) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          errors: formatValidationErrors(validation.errors),
        },
        { status: 400 }
      );
    }

    // Dates stay as YYYY-MM-DD strings all the way to Postgres
    const rows: BulkUpsertRow[] = updates.map((u: Record<string, unknown>) => ({
      ...u,
      row_id: String(u.row_id),
      position: Number(u.position),
      planted_date: (u.planted_date as string) || undefined,
      last_pruned: (u.last_pruned as string) || undefined,
      last_harvest: (u.last_harvest as string) || undefined,
    }));

    const result = await bulkUpsertTrees(orchard_id, rows);

    return NextResponse.json({
      success: true,
      message: `Imported ${result.created + result.updated} trees (${result.created} new, ${result.updated} updated)`,
      created: result.created,
      updated: result.updated,
      total: updates.length,
    });
  } catch (error) {
    return handleApiError(error, 'POST /api/trees/bulk-update');
  }
}
