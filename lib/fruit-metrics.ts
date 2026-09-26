/**
 * What each measurement means, and the units it can be entered in.
 *
 * These are field measurements taken one-handed next to a tree, often by
 * somebody who last used a starch-iodine chart a year ago. A number
 * scale with no legend — "starch 1-8", "seed colour 0-2" — is a number
 * scale nobody can fill in correctly from memory, so each one carries
 * its own definition and the form shows it on the label.
 */

export interface MetricHelp {
  /** One line: what it is and why it is taken. */
  summary: string;
  /** What the individual values mean, where the scale is not obvious. */
  scale?: string;
}

export const METRIC_HELP: Record<string, MetricHelp> = {
  brix: {
    summary:
      'Sugar in the juice, from a drop on a refractometer. Rises as the fruit ripens and sets the potential alcohol.',
    scale:
      'Cider fruit usually picks between 11 and 18 °Bx. Roughly, °Bx ÷ 2 is the potential alcohol by volume.',
  },
  size_mm: {
    summary: 'Widest diameter across the cheek of a typical fruit on the tree.',
    scale: 'A cider apple is commonly 45–75 mm (1.8–3.0 in). Thinning and drought both show up here first.',
  },
  firmness: {
    summary:
      'Force to push an 11 mm penetrometer tip through the peeled cheek. Softening is one of the surest signs a fruit is ready.',
    scale:
      'Most apples are hard above 18 lbf and eating-soft below 12. Picked for storage nearer the top of that.',
  },
  starch_index: {
    summary:
      'How far the starch in the flesh has turned to sugar, read off an iodine-stained cut face against the Cornell 1–8 chart.',
    scale:
      '1 = flesh stains solid black, all starch, far too early. 2–3 = staining retreats from the core. 4 = about half clear, the usual start of the picking window for storage. 5–6 = clear except a ring near the skin, ripe for fresh pressing. 7 = only flecks remain. 8 = no stain at all, fully ripe and past storing.',
  },
  seed_color: {
    summary: 'Colour of the pips in a cut fruit — the least equipment-dependent ripeness check there is.',
    scale: '0 = pale or white, not ready. 1 = mottled, part brown, close. 2 = fully brown, ripe.',
  },
  drop_count: {
    summary:
      'Sound fruit lying under the tree. A sudden rise means the tree is letting go and the picking window is closing.',
  },
};

/** Units a measurement may be entered in, beyond its canonical one. */
export const MM_PER_INCH = 25.4;

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}

export function inchesToMm(inches: number): number {
  return inches * MM_PER_INCH;
}
