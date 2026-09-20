/**
 * Leaf tissue and soil analysis.
 *
 * Leaf analysis is the standard way to know an orchard's nutrient
 * status, because a perennial crop stores and remobilises nutrients in
 * ways a soil test alone cannot show. Soil says what is present; leaf
 * says what the tree actually took up. Both are wanted, and they are
 * read together.
 *
 * ON WHY THE RANGES DO NOT VARY BY INTENT. WSU states plainly that
 * these standards are "valid irrespective of cultivar, rootstock,
 * training system, and environmental conditions". Inventing separate
 * numbers for cider would be making up precision. What the orchard's
 * INTENT changes is not the range, it is what a reading means and what
 * you do about it — which is a separate thing and handled separately
 * below.
 */

export const NUTRIENTS = [
  'n', 'p', 'k', 'ca', 'mg', 's', 'b', 'zn', 'mn', 'fe', 'cu',
] as const;
export type Nutrient = (typeof NUTRIENTS)[number];

export type NutrientUnit = 'percent' | 'ppm';

export interface SufficiencyRange {
  label: string;
  unit: NutrientUnit;
  low: number;
  high: number;
}

/**
 * Apple leaf tissue sufficiency, WSU Tree Fruit Table 1.
 *
 * Sampled from recently mature leaves on non-bearing spurs or new
 * shoots, between the end of active shoot growth and nutrient
 * relocation — July or August here.
 */
export const LEAF_SUFFICIENCY: Record<Nutrient, SufficiencyRange> = {
  n:  { label: 'Nitrogen',   unit: 'percent', low: 1.7,  high: 2.5 },
  p:  { label: 'Phosphorus', unit: 'percent', low: 0.15, high: 0.3 },
  k:  { label: 'Potassium',  unit: 'percent', low: 1.2,  high: 1.9 },
  ca: { label: 'Calcium',    unit: 'percent', low: 1.5,  high: 2.0 },
  mg: { label: 'Magnesium',  unit: 'percent', low: 0.25, high: 0.35 },
  s:  { label: 'Sulfur',     unit: 'percent', low: 0.01, high: 0.10 },
  b:  { label: 'Boron',      unit: 'ppm',     low: 20,   high: 60 },
  zn: { label: 'Zinc',       unit: 'ppm',     low: 15,   high: 200 },
  mn: { label: 'Manganese',  unit: 'ppm',     low: 25,   high: 150 },
  fe: { label: 'Iron',       unit: 'ppm',     low: 60,   high: 120 },
  cu: { label: 'Copper',     unit: 'ppm',     low: 5,    high: 12 },
};

export type NutrientVerdict = 'deficient' | 'adequate' | 'excessive' | 'unmeasured';

export interface NutrientReading {
  nutrient: Nutrient;
  value: number | null;
}

export interface NutrientAssessment extends NutrientReading {
  verdict: NutrientVerdict;
  range: SufficiencyRange;
  /** How far outside the range, as a fraction of its width. */
  distance: number | null;
}

export function assessNutrient(reading: NutrientReading): NutrientAssessment {
  const range = LEAF_SUFFICIENCY[reading.nutrient];
  if (reading.value === null) {
    return { ...reading, verdict: 'unmeasured', range, distance: null };
  }
  const width = range.high - range.low;
  if (reading.value < range.low) {
    return { ...reading, verdict: 'deficient', range, distance: (range.low - reading.value) / width };
  }
  if (reading.value > range.high) {
    return { ...reading, verdict: 'excessive', range, distance: (reading.value - range.high) / width };
  }
  return { ...reading, verdict: 'adequate', range, distance: 0 };
}

export function assessLeafTest(
  readings: readonly NutrientReading[]
): NutrientAssessment[] {
  return readings.map(assessNutrient).sort((a, b) => {
    const rank = (v: NutrientVerdict) =>
      v === 'deficient' ? 0 : v === 'excessive' ? 1 : v === 'adequate' ? 2 : 3;
    return rank(a.verdict) - rank(b.verdict) || (b.distance ?? 0) - (a.distance ?? 0);
  });
}

/* ── What the orchard's intent changes ─────────────────────────────
 *
 * Not the ranges. What a reading MEANS, and what is worth doing about
 * it. The clearest case is nitrogen, where cider and dessert fruit pull
 * in opposite directions and cider pulls both ways at once.
 */

export const FRUIT_PURPOSES = ['cider', 'dessert', 'baking', 'mixed'] as const;
export type FruitPurpose = (typeof FRUIT_PURPOSES)[number];

export const OPERATION_SCALES = ['home', 'small_business', 'commercial'] as const;
export type OperationScale = (typeof OPERATION_SCALES)[number];

export const FRUIT_PURPOSE_LABEL: Record<FruitPurpose, string> = {
  cider: 'Cider',
  dessert: 'Dessert / fresh eating',
  baking: 'Baking / culinary',
  mixed: 'Mixed',
};

export const OPERATION_SCALE_LABEL: Record<OperationScale, string> = {
  home: 'Home orchard',
  small_business: 'Small business',
  commercial: 'Commercial',
};

export interface IntentNote {
  nutrient: Nutrient;
  /** Only shown when the reading is in this state. */
  when: NutrientVerdict[];
  note: string;
}

/**
 * Guidance that depends on what the fruit is for.
 *
 * Nitrogen is the one that genuinely diverges. For dessert fruit the
 * concern is one-sided — high nitrogen costs colour and storage life.
 * For cider it cuts both ways: juice nitrogen feeds the yeast, and
 * below about 140 mg N/L of yeast-assimilable nitrogen a ferment can
 * stick or throw hydrogen sulfide, a threshold most apple musts sit
 * under. But traditional keeved cider DEPENDS on low nitrogen to stall
 * the ferment deliberately, and vintage cultivars take up less nitrogen
 * to begin with. So the same low reading is a problem or the method,
 * depending on what is being made — which the app should say rather
 * than decide.
 */
export const INTENT_NOTES: Record<FruitPurpose, IntentNote[]> = {
  cider: [
    {
      nutrient: 'n',
      when: ['deficient'],
      note: 'Low leaf nitrogen usually means low juice nitrogen, and low juice nitrogen is what stalls a ferment or throws hydrogen sulfide. The 140 mg/L of yeast-assimilable nitrogen often quoted is a WINE standard borrowed for cider, and work on cider suggests the real requirement is higher where fungicide residues are present. Apple juice varies enormously — published values run from 27 to 574 mg/L, and one study measured 53 mg/L and called it typical — so this is a reason to MEASURE yeast-assimilable nitrogen at the press rather than a threshold to assume. Far easier to add nutrient to a must than to rescue a stuck ferment. Unless you are keeving, where low nitrogen is the method rather than the fault.',
    },
    {
      nutrient: 'n',
      when: ['excessive'],
      note: 'High nitrogen drives vigour at the expense of fruit, and for cider the usual penalty — poor colour and short storage — barely matters. Judge this on shoot growth and canker risk rather than on fruit quality.',
    },
    {
      nutrient: 'ca',
      when: ['deficient'],
      note: 'Calcium deficiency shows as bitter pit, which is a cosmetic and storage defect. For fruit going to the press within days of picking that is close to irrelevant — treat this as lower priority than it would be in a dessert block.',
    },
    {
      nutrient: 'k',
      when: ['excessive'],
      note: 'High potassium raises juice pH, which matters for a cider maker: a higher pH is a less stable ferment and a weaker sulfite defence. Worth watching where it would be ignored in a dessert block.',
    },
  ],
  dessert: [
    {
      nutrient: 'n',
      when: ['excessive'],
      note: 'High nitrogen costs red colour, firmness and storage life, and is the classic reason a dessert block underperforms at grading despite looking healthy.',
    },
    {
      nutrient: 'ca',
      when: ['deficient'],
      note: 'Calcium is the priority nutrient for fresh fruit — bitter pit and soft scald both trace back here, and both show up after picking rather than before.',
    },
  ],
  baking: [
    {
      nutrient: 'ca',
      when: ['deficient'],
      note: 'Calcium underpins firmness, which is most of what a culinary apple is judged on once cooked.',
    },
  ],
  mixed: [],
};

/** The notes that apply to a set of readings, given the orchard's use. */
export function intentNotesFor(
  purpose: FruitPurpose,
  assessments: readonly NutrientAssessment[]
): { nutrient: Nutrient; note: string }[] {
  return (INTENT_NOTES[purpose] ?? [])
    .filter((n) => assessments.some((a) => a.nutrient === n.nutrient && n.when.includes(a.verdict)))
    .map((n) => ({ nutrient: n.nutrient, note: n.note }));
}

/**
 * How thoroughly to sample, which is where scale genuinely bites.
 *
 * The sufficiency ranges are the same for a garden and a hundred acres.
 * What changes is how many samples it takes to be representative, and
 * whether the record needs to satisfy anyone but you.
 */
export function samplingGuidance(scale: OperationScale): {
  composites: string;
  soilEvery: string;
  note: string;
} {
  switch (scale) {
    case 'home':
      return {
        composites: 'One composite sample for the whole orchard',
        soilEvery: 'Every 3 years, or when something looks wrong',
        note: 'One sample of 50 to 100 leaves, taken from across the block rather than from the worst-looking trees, tells you almost everything a bigger programme would at this size.',
      };
    case 'small_business':
      return {
        composites: 'One composite per block or per distinct soil type',
        soilEvery: 'Every 3 years',
        note: 'Sample varieties on different rootstocks separately where you can — vigour differences show up in the leaf before they show in the crop.',
      };
    case 'commercial':
      return {
        composites: 'One composite per management block, kept year on year',
        soilEvery: 'Every 2 to 3 years, same points each time',
        note: 'The value is in the trend rather than any single year, so sampling the same points at the same growth stage matters more than the absolute numbers.',
      };
  }
}
