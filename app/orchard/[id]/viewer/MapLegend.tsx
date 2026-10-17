'use client';

import { HARVEST_BADGE_COLOR } from '@/lib/trees-geojson';
import type { HarvestFilter } from '@/lib/tree-harvest-season';

export interface LegendChip {
  key: string;
  label: string;
  count: number;
  /** Dot fill. */
  fill: string;
  /** Dot ring, for a band that needs to read as hollow. */
  ring?: string;
}

export interface HarvestLegend {
  filter: HarvestFilter;
  onChange: (filter: HarvestFilter) => void;
  /** Trees picked out this season, and the rest. */
  complete: number;
  open: number;
}

interface MapLegendProps {
  chips: LegendChip[];
  active: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** One line under the chips explaining what the colours mean. */
  caption?: string;
  /**
   * Picked out vs still to pick. Absent until a tree is complete this
   * season: before the first one there is nothing to tell apart.
   */
  harvest?: HarvestLegend;
}

/**
 * Legend chips that double as filters, plus the harvest filter whose
 * check is drawn on trees picked out this season.
 *
 * Deliberately one component for both map modes: the colours mean
 * different things in each, but the gesture — tap a colour to keep only
 * those trees — should not.
 */
export default function MapLegend({ chips, active, onToggle, caption, harvest }: MapLegendProps) {
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
      {/*
        A filter of its own rather than more chips: the check sits on top of
        whichever colour the dot is, so it crosses the colour chips instead
        of being one of them. Mid-harvest, "To pick" makes the map the list.
      */}
      {harvest && (
        <div
          role="group"
          aria-label="Harvest"
          className="flex items-center gap-1 rounded-full bg-surface/90 p-0.5 shadow text-xs font-medium"
        >
          {(
            [
              ['all', 'All'],
              ['open', `To pick ${harvest.open}`],
              ['complete', `Picked out ${harvest.complete}`],
            ] as const
          ).map(([key, label]) => {
            const on = harvest.filter === key;
            return (
              <button
                key={key}
                onClick={() => harvest.onChange(key)}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 whitespace-nowrap transition-colors ${
                  on ? 'bg-canopy-700 text-white' : 'text-ink hover:bg-canopy-50'
                }`}
              >
                {key === 'complete' && (
                  <svg aria-hidden viewBox="0 0 14 14" className="w-3.5 h-3.5">
                    <circle cx="7" cy="7" r="6" fill={HARVEST_BADGE_COLOR} stroke="white" strokeWidth="1.5" />
                    <path
                      d="M4.2 7.3 6.3 9.2 9.9 5.2"
                      fill="none"
                      stroke="white"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                {label}
              </button>
            );
          })}
        </div>
      )}
      {caption && (
        <p className="text-[11px] text-bark bg-surface/80 rounded-full px-2.5 py-0.5 shadow-sm whitespace-nowrap max-w-full overflow-x-auto">
          {caption}
        </p>
      )}
    </div>
  );
}
