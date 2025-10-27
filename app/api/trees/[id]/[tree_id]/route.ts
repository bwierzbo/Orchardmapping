import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getTreeById,
  updateTree,
  deleteTree
} from '@/lib/db/trees';

/**
 * GET /api/trees/[tree_id]
 * Fetch a single tree by tree_id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tree_id: string }> }
) {
  try {
    const { tree_id } = await params;

    if (!tree_id) {
      return NextResponse.json(
        { error: 'Missing tree_id parameter' },
        { status: 400 }
      );
    }

    // Fetch tree
    const tree = await getTreeById(tree_id);

    if (!tree) {
      return NextResponse.json(
        { error: 'Tree not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      tree
    });
  } catch (error: any) {
    console.error('Error fetching tree:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch tree',
        details: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/trees/[tree_id]
 * Update a tree
 * Requires authentication
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tree_id: string }> }
) {
  try {
    // Check authentication
    const session = await auth();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const { tree_id } = await params;

    if (!tree_id) {
      return NextResponse.json(
        { error: 'Missing tree_id parameter' },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();

    // Remove fields that shouldn't be updated
    const {
      id,
      tree_id: _tree_id,
      orchard_id,
      row_id,
      position,
      created_at,
      updated_at,
      ...updateData
    } = body;

    // Convert date strings to Date objects if provided
    if (updateData.planted_date) {
      updateData.planted_date = new Date(updateData.planted_date);
    }
    if (updateData.last_pruned) {
      updateData.last_pruned = new Date(updateData.last_pruned);
    }
    if (updateData.last_harvest) {
      updateData.last_harvest = new Date(updateData.last_harvest);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Update tree
    const updatedTree = await updateTree(tree_id, updateData);

    if (!updatedTree) {
      return NextResponse.json(
        { error: 'Tree not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Tree updated successfully',
      tree: updatedTree
    });
  } catch (error: any) {
    console.error('Error updating tree:', error);
    return NextResponse.json(
      {
        error: 'Failed to update tree',
        details: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/trees/[tree_id]
 * Delete a tree
 * Requires authentication
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tree_id: string }> }
) {
  try {
    // Check authentication
    const session = await auth();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const { tree_id } = await params;

    if (!tree_id) {
      return NextResponse.json(
        { error: 'Missing tree_id parameter' },
        { status: 400 }
      );
    }

    // Delete tree
    const deleted = await deleteTree(tree_id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Tree not found or already deleted' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Tree deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting tree:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete tree',
        details: error.message
      },
      { status: 500 }
    );
  }
}
