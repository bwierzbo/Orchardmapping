/**
 * Which varieties to offer once a species has been chosen.
 *
 * Narrowing the list is the point -- picking "plum" should not scroll past
 * four hundred apples -- but narrowing it too hard recreates the problem
 * the picker exists to solve. A name the library has never seen has no
 * recorded species, and hiding it would push a grower to retype a name
 * their orchard already uses, which is how one planting became Wegnar,
 * Wegner and wegner in three adjacent positions.
 */
import type { VarietyOption } from './db/varieties';

/** True when this option belongs on the list for `fruitType`. */
export function matchesSpecies(option: VarietyOption, fruitType?: string | null): boolean {
  const want = fruitType?.trim().toLowerCase();
  if (!want) return true;
  // Unknown species: offered, because nothing says it is the wrong one.
  if (option.fruitType == null) return true;
  return option.fruitType.toLowerCase() === want;
}

/**
 * The options to show, in order. Anything already growing here survives the
 * filter whatever species it was recorded as, so an existing tree can
 * always be matched to the name it already carries.
 */
export function visibleVarieties(
  options: readonly VarietyOption[],
  fruitType?: string | null
): VarietyOption[] {
  return options.filter((o) => matchesSpecies(o, fruitType) || o.treeCount > 0);
}

/**
 * The line under a name. Says when something is on the list despite the
 * species filter, so it does not just look like a mismatch.
 */
export function varietyDescription(
  option: VarietyOption,
  fruitType?: string | null
): string | undefined {
  const want = fruitType?.trim().toLowerCase();
  const offSpecies =
    !!want && !!option.fruitType && option.fruitType.toLowerCase() !== want;
  if (!offSpecies) return option.summary ?? undefined;
  return [option.summary, `${option.fruitType}, already here`].filter(Boolean).join(' · ');
}
