import type { ClientTree } from './types';
import { normalizeRowId } from './address';
import { comparePositions } from './position';

/** Trees grouped by normalized row, each row sorted by position. */
function groupRows(trees: ClientTree[]): { rows: string[]; byRow: Map<string, ClientTree[]> } {
  const byRow = new Map<string, ClientTree[]>();
  for (const t of trees) {
    if (!t.row_id || t.position == null || t.position === '') continue;
    const row = normalizeRowId(t.row_id);
    const list = byRow.get(row);
    if (list) list.push(t);
    else byRow.set(row, [t]);
  }
  const rows = [...byRow.keys()].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  for (const list of byRow.values()) {
    list.sort((a, b) => comparePositions(a.position ?? '', b.position ?? ''));
  }
  return { rows, byRow };
}

/**
 * Serpentine walk order: rows numerically ascending; odd row-indexes
 * reverse position order — matching how you physically survey an
 * orchard, up one row and down the next. Trees without a row/position
 * address are excluded (they can't be walked).
 */
export function serpentineOrder(trees: ClientTree[]): ClientTree[] {
  const { rows, byRow } = groupRows(trees);
  const ordered: ClientTree[] = [];
  rows.forEach((row, i) => {
    const list = [...byRow.get(row)!];
    if (i % 2 === 1) list.reverse();
    ordered.push(...list);
  });
  return ordered;
}

/** +1 = toward higher positions / row numbers, -1 = toward lower. */
export type Heading = 1 | -1;

export interface WalkDirection {
  /** Which way to walk along the starting row. */
  along: Heading;
  /** Which way to progress through the rows after the first one. */
  rows: Heading;
}

/**
 * What lies around a starting tree — used by the setup UI to label the
 * direction choices ("toward P12", "then toward R5") and to pick sane
 * defaults. Null when the tree has no row/position address.
 */
export interface WalkContext {
  row: string;
  position: string;
  /** Trees after / before the start within its row. */
  aheadUp: number;
  aheadDown: number;
  /** Neighbouring position labels within the row (null at the row end). */
  nextPosUp: string | null;
  nextPosDown: string | null;
  /** Rows after / before the starting row. */
  rowsUp: number;
  rowsDown: number;
  /** Adjacent row ids (null at the orchard edge). */
  nextRowUp: string | null;
  nextRowDown: string | null;
}

export function walkContext(trees: ClientTree[], startTreeId: string): WalkContext | null {
  const { rows, byRow } = groupRows(trees);
  for (let r = 0; r < rows.length; r++) {
    const list = byRow.get(rows[r])!;
    const p = list.findIndex((t) => t.tree_id === startTreeId);
    if (p < 0) continue;
    return {
      row: rows[r],
      position: list[p].position ?? '',
      aheadUp: list.length - 1 - p,
      aheadDown: p,
      nextPosUp: list[p + 1]?.position ?? null,
      nextPosDown: list[p - 1]?.position ?? null,
      rowsUp: rows.length - 1 - r,
      rowsDown: r,
      nextRowUp: rows[r + 1] ?? null,
      nextRowDown: rows[r - 1] ?? null,
    };
  }
  return null;
}

/** Default heading: whichever way has more trees / rows ahead (ties go up). */
export function defaultDirection(ctx: WalkContext | null): WalkDirection {
  if (!ctx) return { along: 1, rows: 1 };
  return {
    // Forward is the next position up the row, always.
    //
    // This used to pick whichever leg was longer, which saved a few steps
    // and silently reversed what "skip" meant: starting at P17 of a 32-tree
    // row it set off for P1, so skip went to P16 while the walker was
    // plainly heading for P18. Which way round a row runs is the walker's
    // call, on the toggle in setup, not something to infer from where they
    // happened to start.
    along: 1,
    rows: ctx.rowsDown > ctx.rowsUp ? -1 : 1,
  };
}

/**
 * Which way along a row a path already travels.
 *
 * A resumed walk has only its stored list of trees -- the direction that
 * built it is not saved -- so it is read back off the path by finding the
 * first consecutive pair that share a row and seeing which way the position
 * moved. Without this, navigating a resumed walk would use whatever
 * direction the setup screen last defaulted to, which is a guess about a
 * decision that was already made.
 */
export function pathAlong(path: ClientTree[], trees: ClientTree[]): Heading {
  const { byRow } = groupRows(trees);
  const place = (t: ClientTree): { row: string; i: number } | null => {
    if (!t.row_id || t.position == null || t.position === '') return null;
    const row = normalizeRowId(t.row_id);
    const list = byRow.get(row);
    if (!list) return null;
    const i = list.findIndex((x) => x.tree_id === t.tree_id);
    return i < 0 ? null : { row, i };
  };
  for (let k = 0; k + 1 < path.length; k++) {
    const a = place(path[k]);
    const b = place(path[k + 1]);
    if (!a || !b || a.row !== b.row || a.i === b.i) continue;
    return b.i > a.i ? 1 : -1;
  }
  return 1;
}

/**
 * The tree one step back along the row, against the direction of travel.
 *
 * Needed because the walk path puts the trees behind the start at the very
 * end of the list, so stepping back by one array index from the first tree
 * goes nowhere. Starting a walk half way up a row left the back button dead
 * even though the previous tree was standing right there. Back is therefore
 * a question about the row, not about the array.
 */
export function stepBackInRow(
  trees: ClientTree[],
  currentId: string,
  along: Heading,
): ClientTree | null {
  const { byRow } = groupRows(trees);
  for (const list of byRow.values()) {
    const i = list.findIndex((t) => t.tree_id === currentId);
    if (i < 0) continue;
    return list[i - along] ?? null;
  }
  return null;
}

export interface WalkPath {
  path: ClientTree[];
  /**
   * Index where the second leg begins: trees "behind" the start (the
   * rest of its row in the other direction, and the rows on the other
   * side) are appended after the main leg so the walk still covers the
   * whole orchard. Equals path.length when nothing is behind the start.
   */
  turnaround: number;
}

/**
 * Serpentine path from a chosen tree: walk its row in `along`, then
 * step through rows in `rows`, reversing on each new row. Whatever is
 * left behind the start is covered on a second leg that starts back at
 * the start tree and serpentines the other way. Falls back to the
 * default top-of-orchard serpentine when the start tree is unknown.
 */
export function walkPathFrom(
  trees: ClientTree[],
  startTreeId: string | null,
  direction: WalkDirection
): WalkPath {
  const { rows, byRow } = groupRows(trees);
  let r0 = -1;
  let p0 = -1;
  if (startTreeId) {
    for (let r = 0; r < rows.length && r0 < 0; r++) {
      const p = byRow.get(rows[r])!.findIndex((t) => t.tree_id === startTreeId);
      if (p >= 0) {
        r0 = r;
        p0 = p;
      }
    }
  }
  if (r0 < 0) {
    const path = serpentineOrder(trees);
    return { path, turnaround: path.length };
  }

  const rowSlice = (r: number, from: number, heading: Heading): ClientTree[] => {
    const list = byRow.get(rows[r])!;
    if (from < 0 || from >= list.length) return [];
    return heading === 1 ? list.slice(from) : list.slice(0, from + 1).reverse();
  };
  const fullRow = (r: number, heading: Heading): ClientTree[] => {
    const list = byRow.get(rows[r])!;
    return heading === 1 ? list : [...list].reverse();
  };
  const flip = (h: Heading): Heading => (h === 1 ? -1 : 1);

  // Main leg: the start row from the start tree onward, then every row
  // in the chosen row direction, reversing on each.
  const main: ClientTree[] = rowSlice(r0, p0, direction.along);
  let heading = flip(direction.along);
  for (let r = r0 + direction.rows; r >= 0 && r < rows.length; r += direction.rows) {
    main.push(...fullRow(r, heading));
    heading = flip(heading);
  }

  // Second leg: back at the start tree, walk its row the other way
  // (skipping the start tree itself), then the rows on the other side.
  const behind: ClientTree[] = rowSlice(r0, p0 - direction.along, flip(direction.along));
  heading = direction.along;
  for (let r = r0 - direction.rows; r >= 0 && r < rows.length; r -= direction.rows) {
    behind.push(...fullRow(r, heading));
    heading = flip(heading);
  }

  return { path: [...main, ...behind], turnaround: main.length };
}

/**
 * Sampled walk path: within an ordered path, keep only the first
 * `sampleSize` trees of each contiguous variety run (a stretch of the
 * same variety along the walk). Used by bloom/fruit passes when the
 * survey scope is "variety_sample" — a uniform block is checked at its
 * leading trees rather than all of them.
 */
export function sampleVarietyRuns(path: ClientTree[], sampleSize: number): ClientTree[] {
  const sampled: ClientTree[] = [];
  let runVariety: string | null = null;
  let runCount = 0;
  for (const t of path) {
    const v = t.variety ?? '';
    if (v !== runVariety) {
      runVariety = v;
      runCount = 0;
    }
    runCount++;
    if (runCount <= sampleSize) sampled.push(t);
  }
  return sampled;
}

/** Default serpentine, sampled — see {@link sampleVarietyRuns}. */
export function varietySamplePath(trees: ClientTree[], sampleSize: number): ClientTree[] {
  return sampleVarietyRuns(serpentineOrder(trees), sampleSize);
}
