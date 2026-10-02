'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import FilterBar, { type FilterGroup } from '@/components/FilterBar';
import {
  chipCounts,
  matchesChips,
  matchesSearch,
  toggleChip,
  type ChipGroupState,
} from '@/lib/filtering';
import { harvestSortKey } from '@/lib/harvest-window';

/**
 * The variety library, narrowable.
 *
 * A hundred and eleven rows with no search was a page you scrolled looking
 * for a name you already knew. The rows themselves are unchanged; the bar
 * above them is the same one every other list in the app now uses.
 */

export interface VarietyRow {
  variety: string;
  cider_type: string | null;
  bloom_group: number | null;
  harvest_window: string | null;
  acidity: string | null;
  tannin: string | null;
  typical_sg: string | null;
  confidence: string | null;
  tree_count: number;
}

type GroupKey = 'cls' | 'harvest' | 'tannin' | 'planted';

const TYPE_LABEL: Record<string, string> = {
  BSH: 'Bittersharp',
  SH: 'Sharp',
  BSW: 'Bittersweet',
  SW: 'Sweet',
  dessert: 'Dessert',
  crab: 'Crab',
};

/** Which season band a free-text harvest window falls in, for chipping. */
const SEASON_BANDS: { value: string; label: string; max: number }[] = [
  { value: 'aug', label: 'August', max: 243 },
  { value: 'sep', label: 'September', max: 273 },
  { value: 'oct', label: 'October', max: 304 },
  { value: 'nov', label: 'November+', max: 400 },
];

function seasonBand(window: string | null): string | null {
  const key = harvestSortKey(window);
  if (key === Number.MAX_SAFE_INTEGER) return null;
  return SEASON_BANDS.find((b) => key <= b.max)?.value ?? null;
}

export default function VarietyTable({
  varieties,
  divergent,
}: {
  varieties: VarietyRow[];
  divergent: string[];
}) {
  const [query, setQuery] = useState('');
  const [selections, setSelections] = useState<Record<GroupKey, ReadonlySet<string>>>({
    cls: new Set(),
    harvest: new Set(),
    tannin: new Set(),
    planted: new Set(),
  });
  const divergentSet = useMemo(() => new Set(divergent), [divergent]);

  const state: ChipGroupState<GroupKey>[] = useMemo(
    () => (Object.keys(selections) as GroupKey[]).map((key) => ({ key, selected: selections[key] })),
    [selections],
  );

  const valuesOf = (row: VarietyRow, key: GroupKey): (string | null)[] => {
    switch (key) {
      case 'cls':
        return [row.cider_type];
      case 'harvest':
        return [seasonBand(row.harvest_window)];
      case 'tannin':
        return [row.tannin?.toLowerCase() ?? null];
      case 'planted':
        return [row.tree_count > 0 ? 'yes' : 'no'];
    }
  };
  const searchFields = (row: VarietyRow) => [
    row.variety,
    row.cider_type ? TYPE_LABEL[row.cider_type] ?? row.cider_type : null,
    row.harvest_window,
  ];

  const shown = useMemo(
    () =>
      varieties.filter(
        (v) => matchesSearch(searchFields(v), query) && matchesChips(v, state, valuesOf),
      ),
    [varieties, query, state],
  );

  const counts = useMemo(
    () => chipCounts(varieties, state, valuesOf, searchFields, query),
    [varieties, state, query],
  );

  const groups: FilterGroup<GroupKey>[] = useMemo(() => {
    const chip = (key: GroupKey, value: string, label: string) => {
      const count = counts[key]?.[value] ?? 0;
      return count > 0 ? [{ value, label, count }] : [];
    };
    return [
      {
        key: 'cls',
        label: 'Class',
        chips: Object.entries(TYPE_LABEL).flatMap(([value, label]) => chip('cls', value, label)),
      },
      {
        key: 'harvest',
        label: 'Harvest',
        chips: SEASON_BANDS.flatMap((b) => chip('harvest', b.value, b.label)),
      },
      {
        key: 'tannin',
        label: 'Tannin',
        chips: ['low', 'medium', 'high'].flatMap((v) =>
          chip('tannin', v, v[0].toUpperCase() + v.slice(1)),
        ),
      },
      {
        key: 'planted',
        label: 'Planted here',
        chips: [
          ...chip('planted', 'yes', 'In my orchards'),
          ...chip('planted', 'no', 'Not planted'),
        ],
      },
    ];
  }, [counts]);

  return (
    <div className="space-y-4">
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search varieties — name, class or harvest"
        groups={groups}
        state={state}
        onToggle={(key, value) =>
          setSelections((prev) => ({ ...prev, [key]: toggleChip(prev[key], value) }))
        }
        onClear={() => {
          setQuery('');
          setSelections({
            cls: new Set(),
            harvest: new Set(),
            tannin: new Set(),
            planted: new Set(),
          });
        }}
        shown={shown.length}
        total={varieties.length}
        unit="varieties"
      />

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-3 py-2 font-medium text-bark">Variety</th>
              <th className="px-3 py-2 font-medium text-bark">Class</th>
              <th className="px-3 py-2 font-medium text-bark">Bloom</th>
              <th className="px-3 py-2 font-medium text-bark">Harvest</th>
              <th className="px-3 py-2 font-medium text-bark">Acid</th>
              <th className="px-3 py-2 font-medium text-bark">Tannin</th>
              <th className="px-3 py-2 font-medium text-bark">SG</th>
              <th className="px-3 py-2 font-medium text-bark text-right">Trees</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-bark">
                  No variety matches that. Clear the filters to see all {varieties.length}.
                </td>
              </tr>
            ) : (
              shown.map((v) => (
                <tr
                  key={v.variety}
                  className="border-b border-line/60 last:border-0 hover:bg-canopy-50/50"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/varieties/${encodeURIComponent(v.variety)}`}
                      className="font-medium text-ink hover:text-canopy-700 hover:underline"
                    >
                      {v.variety}
                    </Link>
                    {v.confidence === 'low' && (
                      <span className="ml-1.5 text-[10px] text-flag-600 font-mono uppercase">
                        low conf
                      </span>
                    )}
                    {divergentSet.has(v.variety.toLowerCase()) && (
                      <span
                        className="ml-1.5 text-[10px] text-bark font-mono uppercase"
                        title="Measured juice classifies differently from the canonical class — see the variety page"
                      >
                        presents differently
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-bark">
                    {v.cider_type ? (TYPE_LABEL[v.cider_type] ?? v.cider_type) : '—'}
                  </td>
                  <td className="px-3 py-2 text-bark">{v.bloom_group ?? '—'}</td>
                  <td
                    className="px-3 py-2 text-bark max-w-[200px] truncate"
                    title={v.harvest_window ?? undefined}
                  >
                    {v.harvest_window ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-bark capitalize">{v.acidity ?? '—'}</td>
                  <td className="px-3 py-2 text-bark capitalize">{v.tannin ?? '—'}</td>
                  <td
                    className="px-3 py-2 font-mono text-xs text-bark max-w-[90px] truncate"
                    title={v.typical_sg ?? undefined}
                  >
                    {v.typical_sg ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-ink">
                    {v.tree_count || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
