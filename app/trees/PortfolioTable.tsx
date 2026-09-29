'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { TreeStatus } from '@/lib/types';
import StatusBadge from '@/components/StatusBadge';
import { formatYMD } from '@/lib/dates';
import { compareRowIds } from '@/lib/address';
import { comparePositions } from '@/lib/position';
import { estimatePickDate, harvestSortKey } from '@/lib/harvest-window';

/**
 * Every tree the person is responsible for, across orchards.
 *
 * Built for one question the per-orchard table cannot answer: what wants
 * picking next, when the answer might be in any of several places. So the
 * orchard is a column, the default sort is by estimated pick date, and the
 * variety's own words about its harvest window sit beside the estimate --
 * the estimate is derived, the words are what somebody wrote.
 *
 * Read-only on purpose. Editing a tree belongs with that tree's orchard,
 * where the address fields and the map are.
 */

export interface PortfolioRow {
  tree_id: string;
  orchard_id: string;
  orchard_name: string;
  block_id: string | null;
  row_id: string | null;
  position: string | null;
  variety: string | null;
  fruit_type: string | null;
  status: TreeStatus;
  harvest_window: string | null;
  last_harvest: string | null;
}

type SortKey = 'pick' | 'orchard' | 'address' | 'variety' | 'species' | 'status' | 'last_harvest';

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'pick', label: 'Est. pick' },
  { key: 'orchard', label: 'Orchard' },
  { key: 'address', label: 'Where' },
  { key: 'species', label: 'Species' },
  { key: 'variety', label: 'Variety' },
  { key: 'status', label: 'Status' },
  { key: 'last_harvest', label: 'Last picked' },
];

function addressOf(t: PortfolioRow): string {
  return [t.block_id, t.row_id ? `R${t.row_id}` : null, t.position ? `P${t.position}` : null]
    .filter(Boolean)
    .join(' · ');
}

function compare(a: PortfolioRow, b: PortfolioRow, key: SortKey): number {
  switch (key) {
    case 'pick':
      return harvestSortKey(a.harvest_window) - harvestSortKey(b.harvest_window);
    case 'orchard':
      return a.orchard_name.localeCompare(b.orchard_name);
    case 'address': {
      const block = (a.block_id ?? '').localeCompare(b.block_id ?? '');
      if (block !== 0) return block;
      const row = compareRowIds(a.row_id, b.row_id);
      if (row !== 0) return row;
      return comparePositions(a.position ?? '', b.position ?? '');
    }
    case 'variety':
      return (a.variety ?? '').localeCompare(b.variety ?? '');
    case 'species':
      return (a.fruit_type ?? '').localeCompare(b.fruit_type ?? '');
    case 'status':
      return a.status.localeCompare(b.status);
    case 'last_harvest':
      // Never picked sorts last, not as the year zero.
      if (!a.last_harvest && !b.last_harvest) return 0;
      if (!a.last_harvest) return 1;
      if (!b.last_harvest) return -1;
      return a.last_harvest.localeCompare(b.last_harvest);
  }
}

export default function PortfolioTable({ trees }: { trees: PortfolioRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pick');
  const [ascending, setAscending] = useState(true);
  const [orchardFilter, setOrchardFilter] = useState<string>('');
  const [speciesFilter, setSpeciesFilter] = useState<string>('');

  const orchards = useMemo(
    () => [...new Set(trees.map((t) => t.orchard_name))].sort((a, b) => a.localeCompare(b)),
    [trees]
  );
  const species = useMemo(
    () =>
      [...new Set(trees.map((t) => t.fruit_type?.trim()).filter((f): f is string => !!f))].sort(
        (a, b) => a.localeCompare(b)
      ),
    [trees]
  );

  const visible = useMemo(() => {
    const filtered = trees.filter(
      (t) =>
        (!orchardFilter || t.orchard_name === orchardFilter) &&
        (!speciesFilter || (t.fruit_type ?? '').trim() === speciesFilter)
    );
    // Sorted copy: the incoming order is the server's, and mutating it
    // would reorder the caller's array too.
    return [...filtered].sort((a, b) => {
      const primary = compare(a, b, sortKey) * (ascending ? 1 : -1);
      if (primary !== 0) return primary;
      // A stable second key, so trees that tie on the sorted column still
      // read in walking order rather than shuffling between renders.
      return compare(a, b, 'orchard') || compare(a, b, 'address');
    });
  }, [trees, sortKey, ascending, orchardFilter, speciesFilter]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setAscending((v) => !v);
    else {
      setSortKey(key);
      setAscending(true);
    }
  };

  const select =
    'text-sm px-2.5 py-1.5 bg-surface text-ink border border-line rounded-md focus:outline-none focus:ring-2 focus:ring-canopy-600';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={orchardFilter}
          onChange={(e) => setOrchardFilter(e.target.value)}
          className={select}
          aria-label="Filter by orchard"
        >
          <option value="">All orchards</option>
          {orchards.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          value={speciesFilter}
          onChange={(e) => setSpeciesFilter(e.target.value)}
          className={select}
          aria-label="Filter by species"
        >
          <option value="">All species</option>
          {species.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <span className="text-xs text-bark">
          {visible.length} of {trees.length} trees
        </span>
      </div>

      <div className="overflow-x-auto border border-line rounded-lg bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-paper">
            <tr className="text-left">
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium text-bark whitespace-nowrap">
                  <button
                    onClick={() => toggle(c.key)}
                    className="inline-flex items-center gap-1 hover:text-ink"
                    aria-label={`Sort by ${c.label}`}
                  >
                    {c.label}
                    {sortKey === c.key &&
                      (ascending ? (
                        <ArrowUp aria-hidden size={12} />
                      ) : (
                        <ArrowDown aria-hidden size={12} />
                      ))}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 font-medium text-bark">Harvest window</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((t) => {
              const estimate = estimatePickDate(t.harvest_window);
              return (
                <tr key={t.tree_id} className="hover:bg-paper/60">
                  <td className="px-3 py-1.5 whitespace-nowrap font-mono text-xs text-ink">
                    {estimate ? estimate.label : <span className="text-bark/50">—</span>}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <Link
                      href={`/orchard/${t.orchard_id}/trees`}
                      className="text-canopy-700 dark:text-canopy-100 hover:underline"
                    >
                      {t.orchard_name}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap font-mono text-xs text-bark">
                    {addressOf(t) || '—'}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-bark">
                    {t.fruit_type?.trim() || '—'}
                  </td>
                  <td className="px-3 py-1.5 text-ink">{t.variety?.trim() || '—'}</td>
                  <td className="px-3 py-1.5">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap text-bark">
                    {t.last_harvest ? formatYMD(t.last_harvest) : '—'}
                  </td>
                  <td
                    className="px-3 py-1.5 text-bark max-w-[320px] truncate"
                    title={t.harvest_window ?? undefined}
                  >
                    {t.harvest_window?.trim() || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-bark/80">
        Est. pick is read from the variety&rsquo;s harvest window — the first month it names,
        nudged by an early/mid/late qualifier. It is an estimate for ordering the work, not a
        date to pick on. Varieties whose window names no month, or that the library does not
        know, show no estimate and sort last.
      </p>
    </div>
  );
}
