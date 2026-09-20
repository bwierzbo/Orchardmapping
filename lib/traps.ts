/**
 * Monitoring traps.
 *
 * Summer in this program is monitor-only: nothing goes on the calendar,
 * and insecticide is justified by evidence or not at all. A trap is how
 * that evidence arrives, so a threshold step stays a standing watch
 * until a count crosses it.
 *
 * The threshold itself is NOT stored here. It belongs to the program
 * step that acts on it (program_steps.trigger_spec), so there is one
 * place to change "start kaolin on the first catch" rather than two
 * that can disagree.
 */

export const TRAP_TYPES = [
  'red_sphere',
  'cm_pheromone',
  'leafroller_pheromone',
  'yellow_card',
] as const;

export type TrapType = (typeof TRAP_TYPES)[number];

export const TRAP_LABEL: Record<TrapType, string> = {
  red_sphere: 'Red sphere',
  cm_pheromone: 'Codling moth pheromone',
  leafroller_pheromone: 'Leafroller pheromone',
  yellow_card: 'Yellow sticky card',
};

/** pest_library key each trap type reports on. */
export const TRAP_TARGET: Record<TrapType, string> = {
  red_sphere: 'apple_maggot',
  cm_pheromone: 'codling_moth',
  leafroller_pheromone: 'leafrollers',
  yellow_card: 'rosy_apple_aphid',
};

/** Why this trap and not another — the part that is easy to get wrong. */
export const TRAP_NOTE: Record<TrapType, string> = {
  red_sphere:
    'Red spheres only. Snowberry maggot is indistinguishable from apple maggot in the field and is abundant on the Peninsula, so a trap catching both tells you nothing — the sphere is the one that discriminates.',
  cm_pheromone:
    'Delta trap with a pheromone lure. Counts confirm the degree-day model rather than replacing it; the no-biofix model is what drives timing at this latitude.',
  leafroller_pheromone:
    'Species-specific lure. Useful mainly to tell a leafroller problem from an ermine moth one before you spray for the wrong thing.',
  yellow_card:
    'General-purpose sticky card. Broad catch, so it tells you something is flying, not precisely what.',
};

export function isTrapType(value: string): value is TrapType {
  return (TRAP_TYPES as readonly string[]).includes(value);
}

/** One count on one day, as the resolver consumes it. */
export interface TrapCatch {
  trapType: TrapType;
  /** Local YYYY-MM-DD. */
  countedOn: string;
  count: number;
}

/**
 * "Sphere 1" → "Sphere 2". A round of traps goes up in one walk, so the
 * name counts itself up between taps and the panel never has to be
 * retyped. A name with no trailing number is left alone rather than
 * guessed at.
 */
export function nextTrapLabel(label: string): string {
  const m = /^(.*?)(\d+)(\D*)$/.exec(label);
  if (!m) return label;
  return `${m[1]}${Number(m[2]) + 1}${m[3]}`;
}
