import Link from 'next/link';
import type { RowSummary } from '@/lib/dashboard-stats';
import type { TreeStatus } from '@/lib/types';
import { STATUS_COLORS } from '@/lib/trees-geojson';
import { STATUS_LABEL } from '@/components/StatusBadge';

/**
 * Rows × positions grid mirroring the physical orchard. Each occupied cell
 * links to the tree on the map. Statuses are shape-coded as well as
 * colored (CVD-safe secondary encoding, per dataviz validation):
 * healthy = solid, stressed = hollow ring, dead = solid with ×,
 * unknown = dashed outline.
 */

function Cell({ status }: { status: TreeStatus }) {
  const color = STATUS_COLORS[status];
  switch (status) {
    case 'stressed':
      return (
        <span
          aria-hidden
          className="block w-5 h-5 rounded-sm border-[3px]"
          style={{ borderColor: color }}
        />
      );
    case 'dead':
      return (
        <span
          aria-hidden
          className="flex w-5 h-5 rounded-sm items-center justify-center text-white text-[11px] font-bold leading-none"
          style={{ backgroundColor: color }}
        >
          ×
        </span>
      );
    case 'unknown':
      return (
        <span
          aria-hidden
          className="block w-5 h-5 rounded-sm border-2 border-dashed"
          style={{ borderColor: color }}
        />
      );
    default:
      return (
        <span aria-hidden className="block w-5 h-5 rounded-sm" style={{ backgroundColor: color }} />
      );
  }
}

export default function OrchardGrid({
  rows,
  orchardId,
  unplacedCount,
}: {
  rows: RowSummary[];
  orchardId: string;
  unplacedCount: number;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-bark">No trees have row and position assignments yet.</p>;
  }

  // Rows are planted north–south: render each as a vertical strip, row 1
  // leftmost — the grid faces the same way you face the block. Numeric
  // rows keep gap cells for missing positions (a shared height aligns
  // them); free-form rows ("Espalier" with 1N/1S…) render their trees
  // in natural order without invented gaps.
  const numericRows = rows.filter((r) => r.allNumeric);
  const globalMaxPosition = Math.max(1, ...numericRows.map((r) => r.maxPosition));

  const cellLink = (rowId: string, position: string, tree: RowSummary['trees'][number]) => {
    const label = `R${rowId} P${position} — ${tree.variety ?? 'variety unrecorded'}, ${STATUS_LABEL[tree.status].toLowerCase()}. View on map.`;
    return (
      <Link
        key={position}
        href={`/orchard/${orchardId}?tree=${encodeURIComponent(tree.tree_id)}`}
        title={label}
        aria-label={label}
        className="shrink-0 rounded-sm hover:scale-125 transition-transform duration-fast focus-visible:scale-125"
      >
        <Cell status={tree.status} />
      </Link>
    );
  };

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1.5 min-w-fit">
          {rows.map((row) => {
            const header = (
              <span
                className="font-mono text-[10px] text-bark leading-none pb-0.5 max-w-14 truncate"
                title={row.rowId}
              >
                {/^\d+$/.test(row.rowId) ? `R${row.rowId.padStart(2, '0')}` : row.rowId}
              </span>
            );
            if (!row.allNumeric) {
              return (
                <div key={row.rowId} className="flex flex-col items-center gap-1.5">
                  {header}
                  {row.trees.map((tree) => cellLink(row.rowId, tree.position, tree))}
                </div>
              );
            }
            const byPosition = new Map(row.trees.map((t) => [parseInt(t.position, 10), t]));
            return (
              <div key={row.rowId} className="flex flex-col items-center gap-1.5">
                {header}
                {Array.from({ length: globalMaxPosition }, (_, i) => {
                  const position = i + 1;
                  const tree = byPosition.get(position);
                  if (!tree) {
                    return (
                      <span
                        key={position}
                        aria-hidden
                        className="block w-5 h-5 rounded-sm border border-dashed border-line shrink-0"
                      />
                    );
                  }
                  return cellLink(row.rowId, String(position), tree);
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Shape legend (secondary encoding, never color-only) */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4">
        {(['healthy', 'stressed', 'dead', 'unknown'] as TreeStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-xs text-bark">
            <span className="scale-75 -m-0.5">
              <Cell status={s} />
            </span>
            {STATUS_LABEL[s]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-xs text-bark">
          <span aria-hidden className="block w-[15px] h-[15px] rounded-sm border border-dashed border-line" />
          Empty position
        </span>
      </div>

      {unplacedCount > 0 && (
        <p className="survey-caption mt-3">
          {unplacedCount} record-only tree{unplacedCount === 1 ? '' : 's'} not shown (no row/position)
        </p>
      )}
    </div>
  );
}
