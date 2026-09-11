import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-errors';
import {
  getTreesByOrchard,
  insertTree,
  checkDuplicateRowPosition,
  TreeInsertData
} from '@/lib/db/trees';
import { validateTreeRow, formatValidationErrors, TreeRowData } from '@/lib/tree-validation';
import { serializeTree } from '@/lib/serialize';
import { insertTreeEvent } from '@/lib/db/tree-events';

/**
 * GET /api/trees?orchard_id=washington
 * Fetch all trees for a specific orchard
 */
export async function GET(request: NextRequest) {
  try {
    // Get orchard_id from query params
    const searchParams = request.nextUrl.searchParams;
    const orchard_id = searchParams.get('orchard_id');

    if (!orchard_id) {
      return NextResponse.json(
        { error: 'Missing required parameter: orchard_id' },
        { status: 400 }
      );
    }

    // Fetch trees
    const trees = await getTreesByOrchard(orchard_id);

    return NextResponse.json({
      success: true,
      count: trees.length,
      trees: trees.map(serializeTree)
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/trees');
  }
}

/**
 * POST /api/trees
 * Create a new tree
 * Requires authentication
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, response } = await requireSession();
    if (response) return response;

    // Parse request body
    const body = await request.json();
    const {
      orchard_id,
      row_id,
      position,
      lat,
      lng,
      variety,
      fruit_type,
      status,
      planted_date,
      age,
      height,
      last_pruned,
      last_harvest,
      yield_estimate,
      notes
    } = body;

    // Validate required fields
    if (!orchard_id || !row_id || position === undefined || position === null) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          details: 'orchard_id, row_id, and position are required'
        },
        { status: 400 }
      );
    }

    // Validate field values (position label, status enum, date formats)
    const validation = validateTreeRow({
      row_id, position, variety, status, planted_date, age,
      last_pruned, last_harvest, yield_estimate, notes,
    } as TreeRowData);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Validation failed', errors: formatValidationErrors(validation.errors) },
        { status: 400 }
      );
    }

    // Check for duplicate row/position
    const duplicate = await checkDuplicateRowPosition(orchard_id, row_id, position);
    if (duplicate) {
      return NextResponse.json(
        {
          error: 'Duplicate tree location',
          details: `A tree already exists at row ${row_id}, position ${position} in orchard ${orchard_id}`
        },
        { status: 409 }
      );
    }

    // Build tree data
    const treeData: TreeInsertData = {
      orchard_id,
      row_id,
      position,
      lat,
      lng,
      variety,
      fruit_type,
      status,
      // YYYY-MM-DD strings go to Postgres verbatim; new Date() would
      // shift the calendar day through UTC in western timezones
      planted_date: planted_date || undefined,
      age,
      height,
      last_pruned: last_pruned || undefined,
      last_harvest: last_harvest || undefined,
      yield_estimate,
      notes
    };

    // Insert tree
    const tree = await insertTree(treeData);

    await insertTreeEvent(
      {
        tree_id: tree.tree_id,
        orchard_id: tree.orchard_id,
        event_type: 'created',
        detail: `${tree.variety ?? 'Unknown variety'} at R${tree.row_id ?? '?'}·P${tree.position ?? '?'}`,
        created_by: userId,
      },
      { bestEffort: true }
    );

    return NextResponse.json({
      success: true,
      message: 'Tree created successfully',
      tree: serializeTree(tree)
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'POST /api/trees');
  }
}
