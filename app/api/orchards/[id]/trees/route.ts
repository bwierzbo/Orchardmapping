import { NextRequest, NextResponse } from 'next/server';
import { getTreesByOrchard } from '@/lib/db';

// GET /api/orchards/[id]/trees - Get all trees for an orchard
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const trees = await getTreesByOrchard(id);

    return NextResponse.json(trees);
  } catch (error) {
    console.error('Error fetching trees:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trees' },
      { status: 500 }
    );
  }
}