/**
 * Which varieties to offer once a species has been chosen.
 *
 * Picking "pear" shows pears and nothing else. A name the library does not
 * know takes its species from the trees here that carry it, so a grower's
 * own seedling is still filtered once it has been planted as something.
 * Only a name with no species anywhere is offered under every species:
 * hiding it would push a grower to retype a name their orchard already
 * uses, which is how one planting became Wegnar, Wegner and wegner in three
 * adjacent positions.
 */
import type { VarietyOption } from './db/varieties';

/** The one spelling a species is stored and compared in: "Pear " is "pear". */
export function normalizeSpecies(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** True when this option belongs on the list for `fruitType`. */
export function matchesSpecies(option: VarietyOption, fruitType?: string | null): boolean {
  const want = normalizeSpecies(fruitType);
  if (!want) return true;
  // Unknown species: offered, because nothing says it is the wrong one.
  if (option.fruitType == null) return true;
  return normalizeSpecies(option.fruitType) === want;
}

/** The options to show for `fruitType`, in the order given. */
export function visibleVarieties(
  options: readonly VarietyOption[],
  fruitType?: string | null
): VarietyOption[] {
  return options.filter((o) => matchesSpecies(o, fruitType));
}

/**
 * True when `variety` is known to be some other species than `fruitType`,
 * so switching to that species should clear it. A name with no recorded
 * species is left alone.
 */
export function varietyIsOtherSpecies(
  options: readonly VarietyOption[],
  variety: string,
  fruitType?: string | null
): boolean {
  const name = variety.trim().toLowerCase();
  if (!name) return false;
  const option = options.find((o) => o.name.toLowerCase() === name);
  return !!option && !matchesSpecies(option, fruitType);
}
