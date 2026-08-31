'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, MapPin, NotebookPen } from 'lucide-react';
import type { ClientTree, TreeStatus } from '@/lib/types';
import { TREE_STATUSES } from '@/lib/types';
import { STATUS_COLORS } from '@/lib/trees-geojson';
import StatusBadge, { STATUS_LABEL } from '@/components/StatusBadge';
import { formatYMD } from '@/lib/dates';
import { normalizeRowId } from '@/lib/row-id';

type SortKey =
  | 'row'
  | 'position'
  | 'variety'
  | 'status'
  | 'planted_date'
  | 'age'
  | 'height'
  | 'last_pruned'
  | 'last_harvest'
  | 'yield_estimate';

interface Column {
  key: SortKey;
  label: string;
  numeric?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'row', label: 'Row' },
  { key: 'position', label: 'Pos', numeric: true },
  { key: 'variety', label: 'Variety' },
  { key: 'status', label: 'Status' },
  { key: 'planted_date', label: 'Planted' },
  { key: 'age', label: 'Age', numeric: true },
  { key: 'height', label: 'Height', numeric: true },
  { key: 'last_pruned', label: 'Pruned' },
  { key: 'last_harvest', label: 'Harvest' },
  { key: 'yield_estimate', label: 'Yield kg', numeric: true },
];

function rowCompare(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) return na - nb;
  return a.localeCompare(b);
}

function sortValue(tree: ClientTree, key: SortKey): string | number | null {
  switch (key) {
    case 'row':
      return tree.row_id ? normalizeRowId(tree.row_id) : null;
    case 'status':
      return TREE_STATUSES.indexOf(tree.status);
    default:
      return (tree[key] as string | number | null | undefined) ?? null;
  }
}

export default function TreeTable({
  trees,
  orchardId,
}: {
  trees: ClientTree[];
  orchardId: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('row');
  const [sortAsc, setSortAsc] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Set<TreeStatus>>(() => new Set(TREE_STATUSES));
  const [varietyFilter, setVarietyFilter] = useState('');
  const [search, setSearch] = useState('');

  const varieties = useMemo(() => {
    const set = new Set<string>();
    for (const t of trees) if (t.variety?.trim()) set.add(t.variety.trim());
    return [...set].sort();
  }, [trees]);

  const statusCounts = useMemo(() => {
    const counts = { healthy: 0, stressed: 0, dead: 0, unknown: 0 } as Record<TreeStatus, number>;
    for (const t of trees) counts[t.status] += 1;
    return counts;
  }, [trees]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = trees.filter((t) => {
      if (!statusFilter.has(t.status)) return false;
      if (varietyFilter && (t.variety?.trim() ?? '') !== varietyFilter) return false;
      if (q) {
        const hay = `${t.tree_id} ${t.variety ?? ''} ${t.notes ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = sortAsc ? 1 : -1;
    filtered.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      // nulls always last, regardless of direction
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      let cmp: number;
      if (sortKey === 'row') cmp = rowCompare(va as string, vb as string);
      else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      if (cmp !== 0) return cmp * dir;
      // stable tiebreak: row then position
      const rowCmp = rowCompare(
        a.row_id ? normalizeRowId(a.row_id) : null,
        b.row_id ? normalizeRowId(b.row_id) : null
      );
      if (rowCmp !== 0) return rowCmp;
      return (a.position ?? 0) - (b.position ?? 0);
    });
    return filtered;
  }, [trees, statusFilter, varietyFilter, search, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const toggleStatus = (s: TreeStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const dash = <span className="text-bark/50">—</span>;

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {TREE_STATUSES.filter((s) => statusCounts[s] > 0).map((s) => {
          const on = statusFilter.has(s);
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              aria-pressed={on}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors duration-fast ${
                on ? 'bg-surface border-line text-ink' : 'bg-paper border-transparent text-bark/60'
              }`}
            >
              <span
                aria-hidden
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: on ? STATUS_COLORS[s] : '#c4c9c4' }}
              />
              {STATUS_LABEL[s]} {statusCounts[s]}
            </button>
          );
        })}
        <select
          value={varietyFilter}
          onChange={(e) => setVarietyFilter(e.target.value)}
          aria-label="Filter by variety"
          className="text-xs px-2 py-1.5 bg-surface text-ink border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-canopy-600"
        >
          <option value="">All varieties</option>
          {varieties.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search id, variety, notes…"
          aria-label="Search trees"
          className="flex-1 min-w-[140px] text-xs px-2.5 py-1.5 bg-surface text-ink border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-canopy-600"
        />
      </div>

      <p className="survey-caption mb-2">
        Showing {visible.length} of {trees.length}
      </p>

      <div className="overflow-x-auto border border-line rounded-md">
        <table className="w-full text-xs">
          <thead className="bg-paper">
            <tr className="text-left text-bark">
              <th scope="col" className="px-3 py-2 font-medium">
                Tree
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    sortKey === col.key ? (sortAsc ? 'ascending' : 'descending') : 'none'
                  }
                  className="px-3 py-2 font-medium whitespace-nowrap"
                >
                  <button
                    onClick={() => toggleSort(col.key)}
                    className="inline-flex items-center gap-1 hover:text-ink"
                  >
                    {col.label}
                    {sortKey === col.key &&
                      (sortAsc ? (
                        <ArrowUp aria-hidden size={11} />
                      ) : (
                        <ArrowDown aria-hidden size={11} />
                      ))}
                  </button>
                </th>
              ))}
              <th scope="col" className="px-3 py-2 font-medium">
                <span title="Mapped / notes">
                  <MapPin aria-hidden size={12} />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line text-ink">
            {visible.map((t) => (
              <tr key={t.tree_id} className="hover:bg-canopy-50/50">
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <Link
                    href={`/orchard/${orchardId}?tree=${encodeURIComponent(t.tree_id)}`}
                    className="font-mono text-canopy-600 hover:text-canopy-700"
                    title="View on map"
                  >
                    {t.tree_id}
                  </Link>
                </td>
                <td className="px-3 py-1.5 font-mono">{t.row_id ?? dash}</td>
                <td className="px-3 py-1.5 font-mono">{t.position ?? dash}</td>
                <td className="px-3 py-1.5">{t.variety?.trim() || dash}</td>
                <td className="px-3 py-1.5">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {t.planted_date ? formatYMD(t.planted_date) : dash}
                </td>
                <td className="px-3 py-1.5 font-mono">{t.age ?? dash}</td>
                <td className="px-3 py-1.5 font-mono">{t.height ?? dash}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {t.last_pruned ? formatYMD(t.last_pruned) : dash}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {t.last_harvest ? formatYMD(t.last_harvest) : dash}
                </td>
                <td className="px-3 py-1.5 font-mono">{t.yield_estimate ?? dash}</td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    {t.lat != null && t.lng != null ? (
                      <MapPin aria-label="Mapped" size={13} className="text-canopy-600" />
                    ) : (
                      <span aria-label="Not mapped">{dash}</span>
                    )}
                    {t.notes?.trim() && (
                      <NotebookPen
                        aria-label={`Note: ${t.notes.trim()}`}
                        size={13}
                        className="text-bark"
                      >
                        <title>{t.notes.trim()}</title>
                      </NotebookPen>
                    )}
                  </span>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="px-3 py-6 text-center text-bark">
                  No trees match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
