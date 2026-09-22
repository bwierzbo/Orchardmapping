'use client';

export interface LegendChip {
  key: string;
  label: string;
  count: number;
  /** Dot fill. */
  fill: string;
  /** Dot ring, for a band that needs to read as hollow. */
  ring?: string;
}

interface MapLegendProps {
  chips: LegendChip[];
  active: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** One line under the chips explaining what the colours mean. */
  caption?: string;
}

/**
 * Legend chips that double as filters.
 *
 * Deliberately one component for both map modes: the colours mean
 * different things in each, but the gesture — tap a colour to keep only
 * those trees — should not.
 */
export default function MapLegend({ chips, active, onToggle, caption }: MapLegendProps) {
  const shown = chips.filter((c) => c.count > 0);
  if (shown.length === 0) return null;

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 max-w-full px-3">
      <div className="flex gap-1.5 max-w-full overflow-x-auto">
        {shown.map((chip) => {
          const on = active.has(chip.key);
          return (
            <button
              key={chip.key}
              onClick={() => onToggle(chip.key)}
              aria-pressed={on}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow whitespace-nowrap transition-colors ${
                on ? 'bg-surface text-ink' : 'bg-surface/60 text-bark/70'
              }`}
            >
              <span
                aria-hidden
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor: on ? chip.fill : '#c4c9c4',
                  boxShadow: on && chip.ring ? `0 0 0 1.5px ${chip.ring}` : undefined,
                }}
              />
              {chip.label} {chip.count}
            </button>
          );
        })}
      </div>
      {caption && (
        <p className="text-[11px] text-bark bg-surface/80 rounded-full px-2.5 py-0.5 shadow-sm whitespace-nowrap max-w-full overflow-x-auto">
          {caption}
        </p>
      )}
    </div>
  );
}
