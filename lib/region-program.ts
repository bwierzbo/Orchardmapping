import type { Region } from './db/regions';
import type { ValidatedTrigger } from './trigger-schema';

/**
 * Fit a recommended step to the region adopting it.
 *
 * This is the difference between a region that owns settings and one that
 * owns a copy of a calendar. The seeded steps were written for the
 * Olympic rain shadow, where codling moth is counted from January 1
 * because at 48°N January and February contribute too little heat above
 * 50°F to matter. WSU publishes that no-biofix variant as valid north of
 * about 46 degrees. Below it the same thresholds, counted the same way,
 * call first hatch early by days to weeks — so a region that says
 * "biofix" must get a biofix model, not a copy of ours.
 *
 * Only what the region actually states is changed. A setting a region has
 * not made is not a licence to invent one.
 */
export interface StepAdjustment {
  trigger: ValidatedTrigger;
  /** Set when the trigger was changed, for showing beside the step. */
  note: string | null;
}

/** Traps a biofix can be taken from, by pest. */
const BIOFIX_TRAP: Record<string, string> = {
  codling_moth: 'cm_pheromone',
  leafrollers: 'leafroller_pheromone',
};

export function adjustTriggerForRegion(
  trigger: ValidatedTrigger,
  pestKey: string | null,
  region: Pick<Region, 'cmAccumulation'>
): StepAdjustment {
  // Heat models counted from Jan 1 only hold where winter contributes
  // nothing. Where a region says otherwise, the count starts at the
  // first sustained catch instead.
  if (
    trigger.type === 'degree_day' &&
    trigger.from !== 'biofix' &&
    region.cmAccumulation === 'biofix'
  ) {
    const trap = pestKey ? BIOFIX_TRAP[pestKey] : undefined;
    if (!trap) {
      // Without a trap to take the biofix from, a biofix model can never
      // fire. Leaving it on Jan 1 is wrong; silently dropping the step
      // is worse. Keep it and say so.
      return {
        trigger,
        note: 'This region counts heat from a first catch, but no trap is defined for this pest — still counting from January 1, which will run early here.',
      };
    }
    return {
      trigger: { ...trigger, from: 'biofix', biofixTrap: trap },
      note: `Counted from the first catch on the ${trap.replace(/_/g, ' ')} rather than January 1, which this region is too far south for.`,
    };
  }

  return { trigger, note: null };
}
