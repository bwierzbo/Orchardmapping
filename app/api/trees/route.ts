import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getTreesByOrchard,
  insertTree,
  checkDuplicateRowPosition,
  TreeInsertData
} from '@/lib/db/trees';

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
      trees
    });
  } catch (error: any) {
    console.error('Error fetching trees:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch trees',
        details: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trees
 * Create a new tree
 * Requires authentication
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
    const {
      orchard_id,
      row_id,
      position,
      lat,
      lng,
      variety,
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

    // Validate position is a positive number
    if (typeof position !== 'number' || position < 1) {
      return NextResponse.json(
        {
          error: 'Invalid position',
          details: 'position must be a positive number'
        },
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
      status,
      planted_date: planted_date ? new Date(planted_date) : undefined,
      age,
      height,
      last_pruned: last_pruned ? new Date(last_pruned) : undefined,
      last_harvest: last_harvest ? new Date(last_harvest) : undefined,
      yield_estimate,
      notes
    };

    // Insert tree
    const tree = await insertTree(treeData);

    return NextResponse.json({
      success: true,
      message: 'Tree created successfully',
      tree
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating tree:', error);
    return NextResponse.json(
      {
        error: 'Failed to create tree',
        details: error.message
      },
      { status: 500 }
    );
  }
}
