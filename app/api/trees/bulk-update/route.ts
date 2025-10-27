import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { bulkUpdateTrees } from '@/lib/db/trees';

/**
 * POST /api/trees/bulk-update
 * Bulk update trees from CSV data or batch operations
 * Requires authentication
 *
 * Body format:
 * {
 *   orchard_id: "washington",
 *   updates: [
 *     { row_id: "1", position: 1, variety: "Fuji", status: "healthy" },
 *     { row_id: "1", position: 2, variety: "Gala", status: "sick" }
 *   ]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { orchard_id, updates } = body;

    // Validate required fields
    if (!orchard_id) {
      return NextResponse.json(
        {
          error: 'Missing required field',
          details: 'orchard_id is required'
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        {
          error: 'Invalid updates',
          details: 'updates must be a non-empty array'
        },
        { status: 400 }
      );
    }

    // Validate each update has row_id and position
    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      if (!update.row_id || update.position === undefined || update.position === null) {
        return NextResponse.json(
          {
            error: 'Invalid update format',
            details: `Update at index ${i} is missing row_id or position`
          },
          { status: 400 }
        );
      }
    }

    // Process dates in updates
    const processedUpdates = updates.map((update: any) => {
      const processed = { ...update };

      // Convert date strings to Date objects
      if (processed.planted_date) {
        processed.planted_date = new Date(processed.planted_date);
      }
      if (processed.last_pruned) {
        processed.last_pruned = new Date(processed.last_pruned);
      }
      if (processed.last_harvest) {
        processed.last_harvest = new Date(processed.last_harvest);
      }

      return processed;
    });

    // Perform bulk update
    const result = await bulkUpdateTrees(orchard_id, processedUpdates);

    // Determine response status
    const hasErrors = result.errors.length > 0;
    const allFailed = result.updated === 0 && hasErrors;
    const partialSuccess = result.updated > 0 && hasErrors;

    if (allFailed) {
      return NextResponse.json(
        {
          success: false,
          message: 'All updates failed',
          updated: result.updated,
          total: updates.length,
          errors: result.errors
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: partialSuccess
        ? `Updated ${result.updated} trees with ${result.errors.length} errors`
        : `Successfully updated ${result.updated} trees`,
      updated: result.updated,
      total: updates.length,
      errors: result.errors.length > 0 ? result.errors : undefined
    }, {
      status: partialSuccess ? 207 : 200 // 207 = Multi-Status
    });
  } catch (error: any) {
    console.error('Error in bulk update:', error);
    return NextResponse.json(
      {
        error: 'Failed to perform bulk update',
        details: error.message
      },
      { status: 500 }
    );
  }
}
