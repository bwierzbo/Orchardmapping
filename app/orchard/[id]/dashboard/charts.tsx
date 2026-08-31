import type { TreeStatus } from '@/lib/types';
import { TREE_STATUSES } from '@/lib/types';
import { STATUS_COLORS } from '@/lib/trees-geojson';
import { STATUS_LABEL } from '@/components/StatusBadge';

/**
 * Hand-rolled chart primitives (server-rendered).
 * Dataviz rules applied: 2px surface gaps between adjacent fills, rounded
 * data ends, text in ink/bark tokens (never series colors), labels+counts
 * always beside color, per-mark title tooltips.
 */

export function SegmentedStatusBar({
  counts,
  total,
}: {
  counts: Record<TreeStatus, number>;
  total: number;
}) {
  if (total === 0) return null;
  return (
    <div
      className="flex h-3 rounded-full overflow-hidden bg-line"
      role="img"
      aria-label={TREE_STATUSES.map((s) => `${STATUS_LABEL[s]} ${counts[s]}`).join(', ')}
    >
      {TREE_STATUSES.filter((s) => counts[s] > 0).map((s) => (
        <div
          key={s}
          title={`${STATUS_LABEL[s]}: ${counts[s]}`}
          className="h-full border-r-2 border-surface last:border-r-0"
          style={{ width: `${(counts[s] / total) * 100}%`, backgroundColor: STATUS_COLORS[s] }}
        />
      ))}
    </div>
  );
}

export function StatusLegend({
  counts,
  pct,
}: {
  counts: Record<TreeStatus, number>;
  pct: Record<TreeStatus, number>;
}) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5">
      {TREE_STATUSES.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5 text-sm text-ink">
          <span
            aria-hidden
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: STATUS_COLORS[s] }}
          />
          {STATUS_LABEL[s]}
          <span className="font-mono text-xs text-bark">
            {counts[s]} ({pct[s]}%)
          </span>
        </span>
      ))}
    </div>
  );
}

/** Horizontal stacked bar for one category (e.g. a variety). */
export function StackedBarRow({
  label,
  total,
  byStatus,
  maxTotal,
  muted = false,
}: {
  label: string;
  total: number;
  byStatus: Record<TreeStatus, number>;
  maxTotal: number;
  muted?: boolean;
}) {
  const widthPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span
        className={`w-28 shrink-0 truncate font-mono text-xs ${muted ? 'text-bark/60 italic' : 'text-ink'}`}
        title={label}
      >
        {label}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="flex h-4 rounded-[4px] overflow-hidden"
          style={{ width: `${Math.max(widthPct, 2)}%` }}
          role="img"
          aria-label={`${label}: ${TREE_STATUSES.filter((s) => byStatus[s] > 0)
            .map((s) => `${byStatus[s]} ${STATUS_LABEL[s].toLowerCase()}`)
            .join(', ')}`}
        >
          {TREE_STATUSES.filter((s) => byStatus[s] > 0).map((s) => (
            <div
              key={s}
              title={`${label} — ${STATUS_LABEL[s]}: ${byStatus[s]}`}
              className="h-full border-r-2 border-surface last:border-r-0"
              style={{ flex: byStatus[s], backgroundColor: STATUS_COLORS[s] }}
            />
          ))}
        </div>
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-xs text-bark">{total}</span>
    </div>
  );
}

/** Vertical mini-histogram (age buckets, planted years). One hue = magnitude. */
export function Histogram({
  buckets,
  ariaLabel,
}: {
  buckets: { label: string; count: number }[];
  ariaLabel: string;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="flex items-end gap-2 h-28" role="img" aria-label={ariaLabel}>
      {buckets.map((b) => (
        <div key={b.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span className="font-mono text-[11px] text-bark">{b.count > 0 ? b.count : ''}</span>
          <div
            title={`${b.label}: ${b.count}`}
            className="w-full rounded-t-[4px] bg-canopy-600"
            style={{
              height: `${(b.count / max) * 72}px`,
              opacity: b.count === 0 ? 0.15 : 1,
              minHeight: '3px',
            }}
          />
          <span className="font-mono text-[10px] text-bark truncate max-w-full">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Thin completeness/progress line with mono fraction. */
export function ProgressLine({
  label,
  present,
  total,
}: {
  label: string;
  present: number;
  total: number;
}) {
  const pct = total > 0 ? (present / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-sm text-ink truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden">
        <div
          className="h-full rounded-full bg-canopy-600"
          style={{ width: `${pct}%` }}
          title={`${label}: ${present} of ${total}`}
        />
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-xs text-bark">
        {present}/{total}
      </span>
    </div>
  );
}

/** Grouped care-recency bars (pruned/harvested buckets). */
export function CareBars({
  title,
  buckets,
}: {
  title: string;
  buckets: { label: string; count: number; tone: 'ok' | 'warn' | 'muted' }[];
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const toneColor = { ok: STATUS_COLORS.healthy, warn: STATUS_COLORS.stressed, muted: STATUS_COLORS.unknown };
  return (
    <div>
      <p className="text-sm font-medium text-ink mb-2">{title}</p>
      <div className="space-y-1.5">
        {buckets.map((b) => (
          <div key={b.label} className="flex items-center gap-3">
            <span className="w-16 shrink-0 font-mono text-[11px] text-bark">{b.label}</span>
            <div className="flex-1 h-3 rounded-[4px] bg-line/50 overflow-hidden">
              <div
                title={`${title} ${b.label}: ${b.count}`}
                className="h-full rounded-[4px]"
                style={{
                  width: `${(b.count / max) * 100}%`,
                  backgroundColor: toneColor[b.tone],
                  minWidth: b.count > 0 ? '4px' : 0,
                }}
              />
            </div>
            <span className="w-6 shrink-0 text-right font-mono text-xs text-bark">{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
