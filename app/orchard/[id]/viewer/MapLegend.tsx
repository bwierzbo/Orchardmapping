'use client';

import type { TreeStatus } from '@/lib/types';
import { TREE_STATUSES } from '@/lib/types';
import { STATUS_COLORS } from '@/lib/trees-geojson';

const LABELS: Record<TreeStatus, string> = {
  healthy: 'Healthy',
  stressed: 'Stressed',
  dead: 'Dead',
  unknown: 'Unknown',
};

interface MapLegendProps {
  counts: Record<TreeStatus, number>;
  active: ReadonlySet<TreeStatus>;
  onToggle: (status: TreeStatus) => void;
}

/** Legend chips double as status filters. */
export default function MapLegend({ counts, active, onToggle }: MapLegendProps) {
  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 flex gap-1.5 max-w-full overflow-x-auto px-3">
      {TREE_STATUSES.filter((s) => counts[s] > 0).map((status) => {
        const on = active.has(status);
        return (
          <button
            key={status}
            onClick={() => onToggle(status)}
            aria-pressed={on}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow whitespace-nowrap transition-colors ${
              on ? 'bg-surface text-ink' : 'bg-surface/60 text-bark/70'
            }`}
          >
            <span
              aria-hidden
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: on ? STATUS_COLORS[status] : '#c4c9c4' }}
            />
            {LABELS[status]} {counts[status]}
          </button>
        );
      })}
    </div>
  );
}
