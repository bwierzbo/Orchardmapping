/**
 * Find a tree by what a person would type for it.
 *
 * Picking a dot by eye among hundreds is how an inspection lands one tree
 * off. Typing "R13 P21" or "Tree 405" goes to that tree and no other.
 *
 * Understood, most specific first:
 *  - an address: "R13 P21", "r13p21", "13-21", "13/21", "13 21"
 *  - a tree number: "405", "tree 405", "#405"
 *  - a tree id, permanent or legacy: "OBC-001-0405"
 *  - a whole row: "R13" (in walking order)
 *  - anything else: words in the variety or name, "kingston black"
 * Client-safe.
 */
import { compareRowIds, normalizeAddressPart, normalizeRowId } from './address';
import { comparePositions, normalizePosition } from './position';

export interface FindableTree {
  tree_id: string;
  tree_no?: number | null;
  legacy_tree_id?: string | null;
  name?: string | null;
  variety?: string | null;
  row_id?: string | null;
  position?: string | null;
}

export interface FindResult<T> {
  /** The best matches, up to the limit. */
  trees: T[];
  /** How many matched in all, so the list can say there are more. */
  total: number;
}

// A position starts with a digit ("21", "2N"), so a variety such as
// "Pippin" is not read as row "pip", position "in".
const ADDRESS = /^r?\s*([a-z0-9]+?)[\s\-/,·]*p\s*(\d+[a-z]?)$|^(\d+)[\s\-/,·]+(\d+[a-z]?)$/i;
const TREE_NO = /^(?:tree\s*|#)?(\d+)$/i;
const ROW = /^r\s*([a-z0-9]+)$/i;

const sameRow = (t: FindableTree, row: string) =>
  t.row_id != null && normalizeRowId(t.row_id) === normalizeRowId(row);

const samePosition = (t: FindableTree, position: string) =>
  t.position != null && normalizePosition(t.position).toLowerCase() === normalizePosition(position).toLowerCase();

const walkingOrder = (a: FindableTree, b: FindableTree) =>
  compareRowIds(a.row_id ?? null, b.row_id ?? null) ||
  comparePositions(a.position ?? '', b.position ?? '');

export function findTrees<T extends FindableTree>(
  trees: readonly T[],
  query: string,
  limit = 8
): FindResult<T> {
  const q = normalizeAddressPart(query);
  if (q === null) return { trees: [], total: 0 };

  const take = (found: T[]): FindResult<T> => ({ trees: found.slice(0, limit), total: found.length });

  const address = ADDRESS.exec(q);
  if (address) {
    const row = address[1] ?? address[3];
    const position = address[2] ?? address[4];
    return take(trees.filter((t) => sameRow(t, row) && samePosition(t, position)));
  }

  const treeNo = TREE_NO.exec(q);
  if (treeNo) {
    const n = Number(treeNo[1]);
    return take(trees.filter((t) => t.tree_no === n));
  }

  const lower = q.toLowerCase();
  const byId = trees.filter(
    (t) => t.tree_id.toLowerCase() === lower || t.legacy_tree_id?.toLowerCase() === lower
  );
  if (byId.length > 0) return take(byId);

  const row = ROW.exec(q);
  if (row) {
    return take(trees.filter((t) => sameRow(t, row[1])).sort(walkingOrder));
  }

  const words = lower.split(' ');
  return take(
    trees
      .filter((t) => {
        const text = `${t.variety ?? ''} ${t.name ?? ''}`.toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .sort(walkingOrder)
  );
}
