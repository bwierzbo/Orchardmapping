import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/api-auth';
import { validateTreeUpdate, formatValidationErrors, TreeRowData } from '@/lib/tree-validation';
import { serializeTree } from '@/lib/serialize';
import { handleApiError } from '@/lib/api-errors';
import {
  getTreeById,
  updateTree,
  deleteTree
} from '@/lib/db/trees';
import { insertTreeEvent, diffTreeChanges } from '@/lib/db/tree-events';

/**
 * GET /api/trees/[id]
 * Fetch a single tree by tree_id
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tree_id } = await params;

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
      tree: serializeTree(tree)
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/trees/[id]');
  }
}

/**
 * PUT /api/trees/[id]
 * Update a tree
 * Requires authentication
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, response } = await requireSession();
    if (response) return response;

    const { id: tree_id } = await params;

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

    // Validate field values before any coercion
    const validation = validateTreeUpdate(updateData as Partial<TreeRowData>);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Validation failed', errors: formatValidationErrors(validation.errors) },
        { status: 400 }
      );
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Snapshot before the write so the event can carry a field diff
    const before = await getTreeById(tree_id);

    // Update tree
    const updatedTree = await updateTree(tree_id, updateData);

    if (!updatedTree) {
      return NextResponse.json(
        { error: 'Tree not found' },
        { status: 404 }
      );
    }

    // Audit trail (best-effort; a failed audit write never fails the update)
    if (before) {
      const changes = diffTreeChanges(
        before as unknown as Record<string, unknown>,
        updateData
      );
      if (Object.keys(changes).length > 0) {
        const eventType =
          'status' in changes && Object.keys(changes).length === 1
            ? 'status_change'
            : 'lat' in changes || 'lng' in changes
              ? 'moved'
              : 'updated';
        await insertTreeEvent(
          {
            tree_id,
            orchard_id: updatedTree.orchard_id,
            event_type: eventType,
            changes,
            created_by: userId,
          },
          { bestEffort: true }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Tree updated successfully',
      tree: serializeTree(updatedTree)
    });
  } catch (error) {
    return handleApiError(error, 'PUT /api/trees/[id]');
  }
}

/**
 * DELETE /api/trees/[id]
 * Delete a tree
 * Requires authentication
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, response } = await requireSession();
    if (response) return response;

    const { id: tree_id } = await params;

    if (!tree_id) {
      return NextResponse.json(
        { error: 'Missing tree_id parameter' },
        { status: 400 }
      );
    }

    // Snapshot before deletion — the event preserves the final state
    const before = await getTreeById(tree_id);

    // Delete tree
    const deleted = await deleteTree(tree_id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Tree not found or already deleted' },
        { status: 404 }
      );
    }

    if (before) {
      await insertTreeEvent(
        {
          tree_id,
          orchard_id: before.orchard_id,
          event_type: 'deleted',
          detail: `${before.variety ?? 'Unknown variety'} at R${before.row_id ?? '?'}·P${before.position ?? '?'}`,
          changes: { snapshot: serializeTree(before) },
          created_by: userId,
        },
        { bestEffort: true }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Tree deleted successfully'
    });
  } catch (error) {
    return handleApiError(error, 'DELETE /api/trees/[id]');
  }
}
