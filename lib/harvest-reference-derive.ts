/**
 * Turning a researched picking window into what the model stores.
 *
 * The reference table holds what a grower would say -- "late September to
 * mid October" -- and the model wants an interval from bloom. The bridge is
 * the species bloom anchor: a cherry counted from an apple's bloom would be
 * a month out, which is why the anchor is per species.
 */
import { dayOfYear } from './harvest-target';
import { bloomDoyForSpecies } from './species-bloom';
import type { HarvestReference, ReferenceConfidence } from './data/harvest-reference';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export interface DerivedReference {
  variety: string;
  species: string;
  /** Centre of the window, counted from the species bloom anchor. */
  daysFromBloom: number;
  /** Half-width of the researched window, in days — how long picking runs. */
  windowHalfDays: number;
  confidence: ReferenceConfidence;
  ripensHere: boolean;
  /** The window in words, for the variety library and for a human to check. */
  prose: string;
  detail: string;
}

function fmt([m, d]: [number, number]): string {
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

const CONFIDENCE_PHRASE: Record<ReferenceConfidence, string> = {
  good: 'Well documented for this climate.',
  fair: 'Placed from the variety’s type and parentage.',
  poor: 'Little published record — a starting point to correct from your own picking.',
};

export function deriveReference(ref: HarvestReference): DerivedReference {
  const startDoy = dayOfYear(...ref.start);
  const endDoy = dayOfYear(...ref.end);
  const centre = Math.round((startDoy + endDoy) / 2);
  const bloom = bloomDoyForSpecies(ref.species);

  const prose = `${fmt(ref.start)} – ${fmt(ref.end)}${ref.note ? `. ${ref.note}` : ''}`;
  const detail = [
    `Maritime western Washington: ${fmt(ref.start)} to ${fmt(ref.end)}.`,
    CONFIDENCE_PHRASE[ref.confidence],
    ref.ripensHere === false ? 'Does not reach maturity on this coastline.' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    variety: ref.variety,
    species: ref.species,
    daysFromBloom: centre - bloom,
    windowHalfDays: Math.round((endDoy - startDoy) / 2),
    confidence: ref.confidence,
    ripensHere: ref.ripensHere !== false,
    prose,
    detail,
  };
}
