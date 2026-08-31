import type { TreeStatus } from '@/lib/types';
import { STATUS_COLORS } from '@/lib/trees-geojson';

export const STATUS_LABEL: Record<TreeStatus, string> = {
  healthy: 'Healthy',
  stressed: 'Stressed',
  dead: 'Dead',
  unknown: 'Unknown',
};

/** Status pill: color + dot glyph + text, never color-only. */
export default function StatusBadge({ status }: { status: TreeStatus }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${STATUS_COLORS[status]}20`, color: STATUS_COLORS[status] }}
    >
      <span
        aria-hidden
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: STATUS_COLORS[status] }}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}
