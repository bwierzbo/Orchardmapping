/**
 * Where a tree-detection pass files the trees it finds.
 *
 * Detection produces points, not addresses. It used to invent one -- every
 * run wrote the literal row "Scan" -- which put trees in a row nobody had
 * walked and hid them from the block they belong to. The person now says
 * where the scan goes, and may say nothing, because "no address yet" is a
 * truthful answer for a crown spotted in a photograph.
 */

export interface AddressedTree {
  block_id?: string | null;
  row_id?: string | null;
  position?: string | null;
}

/** Same address part, treating null, '' and '  ' as the same absent value. */
function samePart(value: string | null | undefined, wanted: string): boolean {
  return (value ?? '').trim() === wanted;
}

/**
 * The first free position in a block and row, numbering from 1.
 *
 * A second scan of the same place must carry on from the first rather than
 * restart at 1 and collide with it. Only numeric positions count toward the
 * high-water mark: a hand-placed "3N" is a label this sequence cannot
 * continue, and guessing past it would land on top of something.
 */
export function nextScanPosition(
  trees: readonly AddressedTree[],
  block: string,
  row: string
): number {
  const wantBlock = block.trim();
  const wantRow = row.trim();
  let next = 1;
  for (const tree of trees) {
    if (!samePart(tree.block_id, wantBlock)) continue;
    if (!samePart(tree.row_id, wantRow)) continue;
    // Whole digits only. parseInt('3N') is 3, which would hand back 4 and
    // drop this scan's first tree on top of an existing position 4.
    const raw = String(tree.position ?? '').trim();
    if (!/^\d+$/.test(raw)) continue;
    const n = Number(raw);
    if (n >= next) next = n + 1;
  }
  return next;
}

/** The blocks already in use, for suggesting rather than inviting a new spelling. */
export function blocksInUse(trees: readonly AddressedTree[]): string[] {
  const blocks = new Set<string>();
  for (const tree of trees) {
    const block = (tree.block_id ?? '').trim();
    if (block) blocks.add(block);
  }
  return [...blocks].sort((a, b) => a.localeCompare(b));
}
