-- Where every agronomic number in the database came from.
--
-- Five claims were audited by hand and four were wrong. The one that
-- was exactly right was fetched and quoted directly; everything
-- reconstructed from a search summary or from memory was wrong. The
-- errors also ran consistently one way — quieter models, shorter
-- windows, shorter intervals — and copper's re-entry turned out to be
-- half its real value, which is the number deciding when a person may
-- walk back into a treated block.
--
-- So confidence sits beside the value rather than in a commit message
-- nobody will find:
--
--   quoted    verbatim from a named source, sentence stored
--   derived   computed or interpolated from something quoted
--   assumed   OUR default, no source — the ones that bite
--
-- The aim is that the next audit takes an hour: read the assumed rows
-- first, then check each quoted row against its stored sentence.
-- Recording the value alongside means drift between the number and its
-- source is visible rather than silent.

CREATE TABLE IF NOT EXISTS value_provenance (
  subject TEXT PRIMARY KEY,
  value_text TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('quoted', 'derived', 'assumed')),
  source TEXT NOT NULL,
  quote TEXT,
  url TEXT,
  verified_on DATE,
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
--> statement-breakpoint

INSERT INTO value_provenance
  (subject, value_text, confidence, source, quote, url, verified_on, note)
VALUES
('spray_materials.copper.rei_hours', '48 h', 'quoted',
 'PNW Plant Disease Handbook, apple anthracnose',
 '48-hr reentry', 'https://pnwhandbooks.org/plantdisease/host-disease/apple-malus-spp-anthracnose-bulls-eye-rot',
 '2026-09-20',
 'Was recorded as 24 h — half the real value, and in the direction of sending someone into a treated block too early.'),

('spray_materials.copper.rate', '12-16 lb/A (Nu-Cop 50 DF)', 'quoted',
 'PNW Plant Disease Handbook, apple anthracnose',
 'Nu-Cop 50 DF: 12 to 16 lb/A. Do not use if soil pH is 5.5 or below.',
 'https://pnwhandbooks.org/plantdisease/host-disease/apple-malus-spp-anthracnose-bulls-eye-rot',
 '2026-09-20',
 'Rates are not stored in spray_materials by design — the label is the legal document. Recorded here for the season estimate.'),

('spray_materials.copper.max_per_season', '1', 'assumed',
 'Unverified', NULL, NULL, NULL,
 'The handbook actually recommends TWO anthracnose coppers — before fall rains and again at leaf fall. This orchard runs one for harvest reasons; the cap would block adding the second back.'),

('spray_materials.copper.phi_days', 'not recorded', 'assumed',
 'Unverified', NULL, NULL, NULL,
 'Varies by formulation. The engine warns that unknown is not zero rather than implying no restriction.'),

('spray_materials.lime_sulfur.post_infection_hours', '60 h', 'quoted',
 'Post-infection control of apple scab (organic production literature)',
 'Liquid lime sulfur provides 60-70 hours of post-infection activity against apple scab, counting from the beginning of an infection period.',
 NULL, '2026-09-20',
 'Was guessed at 48 h. 60 is the low end of the published range, because the cost of being wrong is a spray that arrived after it could work.'),

('spray_materials.wettable_sulfur.post_infection_hours', 'null — no kickback', 'quoted',
 'PNW Plant Disease Handbook, apple scab',
 'wettable sulfur has no post-infection activity, unlike liquid lime sulfur formulations',
 'https://pnwhandbooks.org/plantdisease/host-disease/apple-malus-spp-scab', '2026-09-20',
 'This is what makes a reactive posture impossible with wettable sulfur, and the engine refuses it.'),

('spray_materials.wettable_sulfur.targets', 'powdery mildew only, NOT scab', 'quoted',
 'PNW Plant Disease Handbook, apple scab',
 'it does not provide good control based on tests west of the Cascade Range',
 'https://pnwhandbooks.org/plantdisease/host-disease/apple-malus-spp-scab', '2026-09-20', NULL),

('spray_materials.horticultural_oil.conflicts_with.wettable_sulfur', '14 days, both directions', 'quoted',
 'WSU Production Guide, fruit and leaf injury',
 'Oil plus wettable sulfur: Either of these products applied within 14 days of one another may mark light colored cherries.',
 'https://cpg.treefruit.wsu.edu/fruit-and-leaf-injury/', '2026-09-20',
 'Note the cited harm is cherry finish, not apple. Kept as a warning because the chemistry is the same.'),

('spray_materials.horticultural_oil.conflicts_after.lime_sulfur', '14 h window, directional', 'assumed',
 'WSU Production Guide, fruit and leaf injury — rule quoted, interval NOT',
 'Do not apply oil to foliage treated with lime-sulfur.',
 'https://cpg.treefruit.wsu.edu/fruit-and-leaf-injury/', '2026-09-20',
 'WSU gives the rule and no interval. 14 days is ours, and the warning text says so rather than implying a citation.'),

('spray_materials.gf120_bait.rate', '10-20 oz/A as a bait spray', 'quoted',
 'PNW Insect Management Handbook, apple maggot',
 'Spinosad (GF-120): 10-20 oz/A as bait spray; PHI 7 days',
 'https://pnwhandbooks.org/insect/tree-fruit/apple/apple-apple-maggot', '2026-09-20', NULL),

('spray_materials.kaolin.rate', '25-50 lb/A, every 7-14 days', 'quoted',
 'PNW Insect Management Handbook, apple maggot',
 'Kaolin clay (Surround WP): 25-50 lb/A; reapply every 7-14 days',
 'https://pnwhandbooks.org/insect/tree-fruit/apple/apple-apple-maggot', '2026-09-20', NULL),

('program_steps.cm_oil_375 / cm_gen1_425 / cm_gen2_1400', '375, 425, 1400 DD base 50 from Jan 1', 'quoted',
 'WSU Tree Fruit, degree-day models (no-biofix variant north of 46°N)',
 NULL, 'https://treefruit.wsu.edu/crop-protection/opm/dd-models/', '2026-09-20',
 'Six years of this orchard''s weather show 1400 DD reached in only two — plan for its absence.'),

('program_steps.leafroller_summer_gen', '435 DD base 41/85 from first moth catch', 'quoted',
 'WSU Tree Fruit, Leafrollers',
 'Pandemis leafroller egg hatch begins about 420 degree-days after first moth catch. Chemical controls should be applied between 420 and 450 degree-days.',
 'https://treefruit.wsu.edu/crop-protection/opm/leafrollers/', '2026-09-20',
 '435 is the midpoint of the quoted 420-450 window.'),

('program_steps.leafroller_bt_spring', 'tight cluster to petal fall, 2-3 passes 7 days apart', 'quoted',
 'WSU Tree Fruit, Leafrollers',
 'good control of leafroller larvae when 2 or 3 applications have been made in the period from tight cluster through petal fall',
 'https://treefruit.wsu.edu/crop-protection/opm/leafrollers/', '2026-09-20', NULL),

('program_steps.leaf_tissue_sample', 'petal fall + 60 days', 'quoted',
 'WSU Tree Fruit, leaf tissue analysis',
 'leaf samples should be collected about 60 to 70 days after petal fall and after terminal buds have set',
 'https://treefruit.wsu.edu/orchard-management/soils-nutrition/leaf-tissue-analysis/', '2026-09-20',
 '60 rather than 70 so the window opens at the start of the published range.'),

('program_steps.copper_leaf_fall', 'at leaf fall, 21-day window', 'derived',
 'PNW Plant Disease Handbook, apple anthracnose',
 'Apply materials before fall rains and again (about 1 month later) when leaves fall from trees.',
 'https://pnwhandbooks.org/plantdisease/host-disease/apple-malus-spp-anthracnose-bulls-eye-rot',
 '2026-09-20',
 'The handbook recommends BOTH. This orchard runs only the leaf-fall one because the pre-rain timing lands on a full crop of late cider varieties — a deliberate trade, tested by the canker count.'),

('program_steps.leaf_litter_sanitation', '5% urea, 50-80% inoculum reduction', 'quoted',
 'WSU EM066E / owner IPM plan 2026-09',
 NULL, NULL, NULL,
 'Quoted in the source plan rather than fetched directly here — worth re-checking against EM066E.'),

('pest_library.prevalence', 'regional ranking for the Olympic rain shadow', 'derived',
 'Owner IPM research plan, 2026-09, WSU-primary',
 NULL, NULL, NULL,
 'Rankings differ from eastern-Washington guidance by design. Not independently re-verified in this audit.')

ON CONFLICT (subject) DO NOTHING;
