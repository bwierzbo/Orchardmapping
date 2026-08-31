import type { ClientTree, TreeStatus } from './types';
import { TREE_STATUSES } from './types';
import { dateToYMD } from './dates';
import { normalizeRowId } from './row-id';

export interface VarietyStat {
  /** null = variety not recorded */
  variety: string | null;
  total: number;
  byStatus: Record<TreeStatus, number>;
}

export interface RowTree {
  tree_id: string;
  position: number;
  status: TreeStatus;
  variety: string | null;
  hasCoords: boolean;
}

export interface RowSummary {
  rowId: string;
  maxPosition: number;
  trees: RowTree[];
}

export interface AgeBucket {
  label: string;
  min: number;
  max: number | null;
  count: number;
}

export interface CareBuckets {
  under6mo: number;
  sixTo12mo: number;
  over12mo: number;
  never: number;
}

export interface CompletenessStat {
  field: string;
  label: string;
  present: number;
}

export interface OrchardStats {
  total: number;
  statusCounts: Record<TreeStatus, number>;
  statusPct: Record<TreeStatus, number>;
  varieties: VarietyStat[];
  rows: RowSummary[];
  unplacedCount: number;
  ageHistogram: AgeBucket[];
  ageUnknown: number;
  heightStats: { count: number; min: number; avg: number; max: number } | null;
  yieldStats: {
    totalKg: number;
    treesWithData: number;
    avgKg: number;
    topVariety: { variety: string | null; totalKg: number } | null;
  };
  careRecency: { pruned: CareBuckets; harvest: CareBuckets };
  plantedByYear: { year: number; count: number }[];
  plantedUnknown: number;
  completeness: CompletenessStat[];
  notes: {
    tree_id: string;
    row_id: string | null;
    position: number | null;
    variety: string | null;
    status: TreeStatus;
    notes: string;
  }[];
}

const AGE_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: '0–2', min: 0, max: 3 },
  { label: '3–5', min: 3, max: 6 },
  { label: '6–10', min: 6, max: 11 },
  { label: '11–20', min: 11, max: 21 },
  { label: '21+', min: 21, max: null },
];

function emptyStatusRecord(): Record<TreeStatus, number> {
  return { healthy: 0, stressed: 0, dead: 0, unknown: 0 };
}

/** Numeric-aware row comparator ("2" before "10"), matching the viewer. */
function compareRows(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  const aNum = !Number.isNaN(na) && /^\d+$/.test(a);
  const bNum = !Number.isNaN(nb) && /^\d+$/.test(b);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}

function addMonths(date: Date, months: number): Date {
  // Clamp to the target month's last day (Aug 31 - 6mo => Feb 28, not Mar 3)
  const targetMonth = date.getMonth() + months;
  const lastDay = new Date(date.getFullYear(), targetMonth + 1, 0).getDate();
  return new Date(date.getFullYear(), targetMonth, Math.min(date.getDate(), lastDay));
}

function bucketCare(dates: (string | null | undefined)[], now: Date): CareBuckets {
  // YMD strings compare correctly lexically — no Date parsing, no TZ drift
  const cutoff6 = dateToYMD(addMonths(now, -6));
  const cutoff12 = dateToYMD(addMonths(now, -12));
  const buckets: CareBuckets = { under6mo: 0, sixTo12mo: 0, over12mo: 0, never: 0 };
  for (const raw of dates) {
    const ymd = raw && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
    if (!ymd) buckets.never++;
    else if (ymd >= cutoff6) buckets.under6mo++;
    else if (ymd >= cutoff12) buckets.sixTo12mo++;
    else buckets.over12mo++;
  }
  return buckets;
}

export function computeOrchardStats(trees: ClientTree[], now: Date = new Date()): OrchardStats {
  const total = trees.length;

  // --- status ---
  const statusCounts = emptyStatusRecord();
  for (const t of trees) statusCounts[t.status] += 1;
  const statusPct = emptyStatusRecord();
  for (const s of TREE_STATUSES) {
    statusPct[s] = total > 0 ? Math.round((statusCounts[s] / total) * 100) : 0;
  }

  // --- varieties ---
  const varietyMap = new Map<string | null, VarietyStat>();
  for (const t of trees) {
    const key = t.variety?.trim() ? t.variety.trim() : null;
    let stat = varietyMap.get(key);
    if (!stat) {
      stat = { variety: key, total: 0, byStatus: emptyStatusRecord() };
      varietyMap.set(key, stat);
    }
    stat.total += 1;
    stat.byStatus[t.status] += 1;
  }
  const varieties = [...varietyMap.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return (a.variety ?? '￿').localeCompare(b.variety ?? '￿');
  });

  // --- rows grid ---
  const rowMap = new Map<string, RowTree[]>();
  let unplacedCount = 0;
  for (const t of trees) {
    if (!t.row_id || t.position == null) {
      unplacedCount++;
      continue;
    }
    const rowId = normalizeRowId(t.row_id);
    if (!rowMap.has(rowId)) rowMap.set(rowId, []);
    rowMap.get(rowId)!.push({
      tree_id: t.tree_id,
      position: t.position,
      status: t.status,
      variety: t.variety?.trim() || null,
      hasCoords: t.lat != null && t.lng != null,
    });
  }
  const rows: RowSummary[] = [...rowMap.entries()]
    .sort(([a], [b]) => compareRows(a, b))
    .map(([rowId, rowTrees]) => {
      rowTrees.sort((a, b) => a.position - b.position);
      return {
        rowId,
        maxPosition: rowTrees.reduce((m, t) => Math.max(m, t.position), 0),
        trees: rowTrees,
      };
    });

  // --- age ---
  const ageHistogram: AgeBucket[] = AGE_BUCKETS.map((b) => ({ ...b, count: 0 }));
  let ageUnknown = 0;
  for (const t of trees) {
    const age = t.age;
    if (age == null || Number.isNaN(age) || age < 0) {
      ageUnknown++;
      continue;
    }
    const bucket = ageHistogram.find((b) => age >= b.min && (b.max === null || age < b.max));
    if (bucket) bucket.count++;
    else ageUnknown++;
  }

  // --- height ---
  const heights = trees.map((t) => t.height).filter((h): h is number => h != null && !Number.isNaN(h));
  const heightStats =
    heights.length > 0
      ? {
          count: heights.length,
          min: Math.min(...heights),
          avg: Math.round((heights.reduce((a, b) => a + b, 0) / heights.length) * 10) / 10,
          max: Math.max(...heights),
        }
      : null;

  // --- yield ---
  const yieldTrees = trees.filter(
    (t): t is ClientTree & { yield_estimate: number } =>
      t.yield_estimate != null && !Number.isNaN(t.yield_estimate)
  );
  const totalKg = Math.round(yieldTrees.reduce((a, t) => a + t.yield_estimate, 0) * 10) / 10;
  const yieldByVariety = new Map<string | null, number>();
  for (const t of yieldTrees) {
    const key = t.variety?.trim() ? t.variety.trim() : null;
    yieldByVariety.set(key, (yieldByVariety.get(key) ?? 0) + t.yield_estimate);
  }
  let topVariety: { variety: string | null; totalKg: number } | null = null;
  for (const [variety, kg] of yieldByVariety) {
    if (
      !topVariety ||
      kg > topVariety.totalKg ||
      (kg === topVariety.totalKg &&
        (variety ?? '￿').localeCompare(topVariety.variety ?? '￿') < 0)
    ) {
      topVariety = { variety, totalKg: Math.round(kg * 10) / 10 };
    }
  }
  const yieldStats = {
    totalKg,
    treesWithData: yieldTrees.length,
    avgKg: yieldTrees.length > 0 ? Math.round((totalKg / yieldTrees.length) * 10) / 10 : 0,
    topVariety,
  };

  // --- care recency ---
  const careRecency = {
    pruned: bucketCare(trees.map((t) => t.last_pruned), now),
    harvest: bucketCare(trees.map((t) => t.last_harvest), now),
  };

  // --- planted by year ---
  const yearMap = new Map<number, number>();
  let plantedUnknown = 0;
  for (const t of trees) {
    const year = t.planted_date ? parseInt(t.planted_date.slice(0, 4), 10) : NaN;
    if (Number.isNaN(year) || year < 1000) {
      plantedUnknown++;
      continue;
    }
    yearMap.set(year, (yearMap.get(year) ?? 0) + 1);
  }
  const plantedByYear = [...yearMap.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);

  // --- completeness ---
  const has = (fn: (t: ClientTree) => boolean) => trees.filter(fn).length;
  const completeness: CompletenessStat[] = [
    { field: 'coords', label: 'Mapped (lat/lng)', present: has((t) => t.lat != null && t.lng != null) },
    { field: 'row_position', label: 'Row & position', present: has((t) => !!t.row_id && t.position != null) },
    { field: 'variety', label: 'Variety', present: has((t) => !!t.variety?.trim()) },
    { field: 'planted_date', label: 'Planted date', present: has((t) => !!t.planted_date) },
    { field: 'age', label: 'Age', present: has((t) => t.age != null) },
    { field: 'height', label: 'Height', present: has((t) => t.height != null) },
    { field: 'last_pruned', label: 'Last pruned', present: has((t) => !!t.last_pruned) },
    { field: 'last_harvest', label: 'Last harvest', present: has((t) => !!t.last_harvest) },
    { field: 'yield_estimate', label: 'Yield estimate', present: has((t) => t.yield_estimate != null) },
  ];

  // --- notes ---
  const notes = trees
    .filter((t) => t.notes?.trim())
    .map((t) => ({
      tree_id: t.tree_id,
      row_id: t.row_id ?? null,
      position: t.position ?? null,
      variety: t.variety?.trim() || null,
      status: t.status,
      notes: t.notes!.trim(),
    }))
    .sort((a, b) => {
      const rowCmp = compareRows(
        normalizeRowId(a.row_id ?? ''),
        normalizeRowId(b.row_id ?? '')
      );
      if (rowCmp !== 0) return rowCmp;
      return (a.position ?? 0) - (b.position ?? 0);
    });

  return {
    total,
    statusCounts,
    statusPct,
    varieties,
    rows,
    unplacedCount,
    ageHistogram,
    ageUnknown,
    heightStats,
    yieldStats,
    careRecency,
    plantedByYear,
    plantedUnknown,
    completeness,
    notes,
  };
}
