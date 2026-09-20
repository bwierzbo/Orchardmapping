/**
 * Where every agronomic number came from.
 *
 * Five claims were audited by hand and four were wrong. The one that
 * was exactly right was the one fetched and quoted directly; everything
 * reconstructed from a search summary or from memory was wrong — and
 * the errors ran consistently one way, toward quieter models and
 * shorter intervals. Copper's re-entry was half its real value, which
 * is a number that decides when a person may walk back into a treated
 * block.
 *
 * So confidence is recorded beside the value, not in a commit message
 * where nobody will find it:
 *
 *   quoted    verbatim from a named source, with the sentence stored
 *   derived   computed or interpolated from something quoted
 *   assumed   OUR default, no source. These are the ones that bite.
 *
 * The point is not bookkeeping. It is that the next audit should take
 * an hour rather than a session: run the audit script, read the
 * `assumed` rows first, and check the `quoted` ones against their
 * stored sentence.
 */

export const CONFIDENCE = ['quoted', 'derived', 'assumed'] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export interface Provenance {
  /** Dotted path to the value: "lib/scab.ts MILLS.light" or
   *  "spray_materials.copper.rei_hours". */
  subject: string;
  /** What is recorded, so drift between value and source is visible. */
  value: string;
  confidence: Confidence;
  /** Named source. "Unverified" is itself a source worth naming. */
  source: string;
  /** The sentence it came from, where one exists. */
  quote?: string;
  url?: string;
  /** ISO date the claim was last checked against its source. */
  verifiedOn?: string;
  /** Why an assumption was made, and what would replace it. */
  note?: string;
}

/**
 * Values held in code rather than in the database.
 *
 * Database values carry their provenance in the value_provenance table;
 * this covers the constants, which the same audit script reads.
 */
export const CODE_PROVENANCE: Provenance[] = [
  {
    subject: 'lib/gdd.ts CODLING_MOTH_MODEL',
    value: 'base 50°F, cutoff 88°F, from Jan 1 (no biofix)',
    confidence: 'quoted',
    source: 'WSU Tree Fruit, degree-day models',
    quote:
      'Port Angeles is north of 46°N, so the no-biofix variant applies: accumulate from January 1 and read milestones directly off the running total.',
    url: 'https://treefruit.wsu.edu/crop-protection/opm/dd-models/',
    verifiedOn: '2026-09-20',
  },
  {
    subject: 'lib/gdd.ts LEAFROLLER_MODEL',
    value: 'base 41°F, cutoff 85°F',
    confidence: 'quoted',
    source: 'WSU Tree Fruit, Leafrollers',
    quote: 'The lower threshold is 41°F and the upper 85°F.',
    url: 'https://treefruit.wsu.edu/crop-protection/opm/leafrollers/',
    verifiedOn: '2026-09-20',
  },
  {
    subject: 'lib/scab.ts MILLS.light/moderate/severe',
    value: '9 / 12 / 18 h at 61-75°F',
    confidence: 'quoted',
    source: 'New England Tree Fruit Management Guide, Jones revision of Mills',
    quote: 'Low infection hours: 9 · Moderate: 12 · High: 18 (61-75°F)',
    url: 'https://netreefruit.org/apples/diseases/apple-scab',
    verifiedOn: '2026-09-20',
  },
  {
    subject: 'lib/scab.ts MILLS.minimum',
    value: '6 h at 61-75°F, 28 h at 39°F',
    confidence: 'quoted',
    source: 'MacHardy & Gadoury 1989, as used by NEWA',
    quote:
      'NEWA Infection Hours are the minimum hours of leaf wetness used by NEWA, as modified in 1989 by MacHardy and Gadoury, from the Jones version of Mills original table.',
    url: 'https://netreefruit.org/apples/diseases/apple-scab',
    verifiedOn: '2026-09-20',
    note:
      'Three hours below the light-infection threshold. Reporting only light-and-above kept the model silent through events a running system would call.',
  },
  {
    subject: 'lib/scab.ts MILLS interpolation between table rows',
    value: 'linear between adjacent temperatures',
    confidence: 'derived',
    source: 'Interpolation of the quoted table',
    note: 'The published table is stepped; the curve between rows is our choice, not theirs.',
  },
  {
    subject: 'lib/scab.ts MIN_TEMP_F',
    value: '33°F — below this no infection is considered possible',
    confidence: 'assumed',
    source: 'Unverified',
    note:
      'The published table simply stops near freezing rather than stating a hard floor. Replace with whatever the source actually says about sub-freezing wetness.',
  },
  {
    subject: 'lib/scab.ts WETNESS_DEFAULTS.precipMm',
    value: '0.2 mm in an hour counts as wet',
    confidence: 'assumed',
    source: 'Unverified',
    note:
      'Mills is defined on measured leaf wetness, not rainfall. This is our proxy. A leaf wetness sensor removes the need for it entirely.',
  },
  {
    subject: 'lib/scab.ts WETNESS_DEFAULTS.rhPct',
    value: '90% relative humidity counts as wet',
    confidence: 'quoted',
    source: 'Sentelhas et al., suitability of relative humidity as an estimator of leaf wetness duration',
    quote:
      'The RH ≥ 90% model performed best, presenting the highest general fraction of correct estimates (FC), between 0.87 and 0.92, and the lowest false alarm ratio (FAR), between 0.02 and 0.31.',
    url: 'https://www.sciencedirect.com/science/article/abs/pii/S0168192307002614',
    verifiedOn: '2026-09-20',
    note:
      'Was marked assumed; it is in fact the best-performing threshold across several continents, and it halves the disagreement between paired sensors. The known bias is toward UNDER-estimating wetness, which argues against raising it. Sensitivity measured over six seasons of this orchard: moving to 87% adds about 12% more infection periods, to 85% about 28%, while moving up to 93% roughly halves them — 90 sits on the gentle side of a knee.',
  },
  {
    subject: 'lib/scab.ts WETNESS_DEFAULTS.breakHours',
    value: '4 dry hours bridged inside one wet period',
    confidence: 'assumed',
    source: 'Unverified',
    note: 'Leaves in shade stay wet through a gap a gauge reads as dry. The number is ours.',
  },
  {
    subject: 'lib/nutrition.ts LEAF_SUFFICIENCY',
    value: 'N 1.7-2.5%, Ca 1.5-2.0%, B 20-60 ppm, and the rest',
    confidence: 'quoted',
    source: 'WSU Tree Fruit, leaf tissue analysis Table 1',
    quote:
      'valid irrespective of cultivar, rootstock, training system, and environmental conditions',
    url: 'https://treefruit.wsu.edu/orchard-management/soils-nutrition/leaf-tissue-analysis/',
    verifiedOn: '2026-09-20',
  },
  {
    subject: 'lib/nutrition.ts INTENT_NOTES.cider.n (YAN)',
    value: '140 mg/L quoted as a WINE standard, not a cider one',
    confidence: 'quoted',
    source: 'Boudreau et al., fungicide residues and YAN in cider fermentation',
    quote:
      'The generally accepted minimum recommended concentration of YAN to successfully complete fermentation is 140 mg L−1 for wine.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5215524/',
    verifiedOn: '2026-09-20',
    note:
      'The same paper found cider needs MORE than this where fungicide residue is present. Apple juice runs 27-574 mg/L. The note tells the grower to measure rather than assume.',
  },
  {
    subject: 'lib/ipm-schedule.ts ThresholdTrigger.staleAfterDays',
    value: '21 days after the last qualifying catch',
    confidence: 'assumed',
    source: 'Unverified',
    note:
      'Chosen so a July catch stops demanding a spray in September. A real flight-end criterion would be better.',
  },
  {
    subject: 'lib/weather-source.ts interpolateHour',
    value: 'linear between two stations',
    confidence: 'assumed',
    source: 'Unverified',
    note:
      'Well justified for temperature and dew point, weak for rainfall — a rain shadow decays roughly exponentially into the lee. Fit the relationship from a season of both stations instead.',
  },
];
