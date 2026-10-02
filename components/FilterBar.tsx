'use client';

import { Search, X } from 'lucide-react';
import { isUnfiltered, type ChipGroupState } from '@/lib/filtering';

/**
 * The one filter bar, on every list in the app.
 *
 * Search first, chip rows under it, the count and Clear on the right. Chips
 * carry their own counts, which is the thing a dropdown cannot do: you can
 * see there are 63 Sharp before deciding whether to tap it, and a value no
 * row carries is simply absent rather than present and empty.
 *
 * Multi-select, OR within a row and AND between rows. Nobody is told that,
 * and nobody needs to be — it is what "Bittersharp, Bittersweet, Late"
 * already means to a person reading it.
 */

export interface FilterChip {
  value: string;
  label: string;
  /** How many rows this chip would leave. Absent values are not rendered. */
  count: number;
}

export interface FilterGroup<Key extends string = string> {
  key: Key;
  label: string;
  chips: FilterChip[];
}

export default function FilterBar<Key extends string>({
  query,
  onQueryChange,
  searchPlaceholder = 'Search…',
  groups,
  state,
  onToggle,
  onClear,
  shown,
  total,
  unit = 'rows',
}: {
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder?: string;
  groups: readonly FilterGroup<Key>[];
  state: readonly ChipGroupState<Key>[];
  onToggle: (key: Key, value: string) => void;
  onClear: () => void;
  shown: number;
  total: number;
  /** What is being counted, for the "3 of 111 varieties" line. */
  unit?: string;
}) {
  const clean = isUnfiltered(query, state);
  const selectedFor = (key: Key) =>
    state.find((s) => s.key === key)?.selected ?? (new Set<string>() as ReadonlySet<string>);

  return (
    <div className="bg-surface border border-line rounded-xl p-3.5 sm:p-4 space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="relative flex-grow">
          <Search
            aria-hidden
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-bark"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-bark/70 focus:outline-none focus:ring-2 focus:ring-canopy-600"
          />
        </div>
        <span className="shrink-0 font-mono text-xs text-bark whitespace-nowrap">
          {clean ? `${total} ${unit}` : `${shown} of ${total}`}
        </span>
        <button
          type="button"
          onClick={onClear}
          disabled={clean}
          className="shrink-0 inline-flex items-center gap-1 h-10 px-3 rounded-lg border border-line bg-paper text-sm font-medium text-bark hover:bg-canopy-50 hover:text-ink disabled:opacity-40 disabled:hover:bg-paper"
        >
          <X aria-hidden size={14} /> Clear
        </button>
      </div>

      {groups.map((group) => {
        // A group whose values nothing currently carries is dropped rather
        // than shown as an empty row: it is not a filter you can use.
        if (group.chips.length === 0) return null;
        const selected = selectedFor(group.key);
        return (
          <div key={group.key} className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-2.5">
            <div className="sm:w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-bark sm:pt-1.5">
              {group.label}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.chips.map((chip) => {
                const on = selected.has(chip.value);
                return (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => onToggle(group.key, chip.value)}
                    aria-pressed={on}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border active:scale-[0.97] ${
                      on
                        ? 'bg-canopy-700 border-canopy-700 text-white'
                        : 'border-line bg-paper text-ink hover:bg-canopy-50'
                    }`}
                  >
                    {chip.label}{' '}
                    <span className={on ? 'opacity-75' : 'text-bark'}>{chip.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
