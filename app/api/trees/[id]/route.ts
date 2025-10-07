import { NextRequest, NextResponse } from 'next/server';
import { getTreeById, updateTree, upsertTree } from '@/lib/db';

// GET /api/trees/[id] - Get tree details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tree = await getTreeById(id);

    if (!tree) {
      return NextResponse.json(
        { error: 'Tree not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(tree);
  } catch (error) {
    console.error('Error fetching tree:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tree' },
      { status: 500 }
    );
  }
}

// PUT /api/trees/[id] - Update tree details
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Remove fields that shouldn't be updated directly
    delete body.id;
    delete body.tree_id;
    delete body.created_at;

    const tree = await upsertTree({
      ...body,
      tree_id: id
    });

    if (!tree) {
      return NextResponse.json(
        { error: 'Failed to update tree' },
        { status: 500 }
      );
    }

    return NextResponse.json(tree);
  } catch (error) {
    console.error('Error updating tree:', error);
    return NextResponse.json(
      { error: 'Failed to update tree' },
      { status: 500 }
    );
  }
}