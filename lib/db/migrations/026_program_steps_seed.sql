-- The Port Angeles program, from the 2026-09 WSU-primary research.
--
-- The core inversion versus an eastern-Washington schedule: west of the
-- Cascades the year is DISEASE-led and starts in autumn, not spring.
-- Fall copper and canker excision come first; summer is monitor-only,
-- with insecticide on trap evidence rather than on the calendar.
--
-- Anthracnose is knife-first on purpose. WSU's own fungicide trial
-- failed here (Garton 2019 — 77% canker growth despite sprays), so
-- excision is the program and copper is support.

INSERT INTO program_steps
  (key, title, detail, category, pest_key, material_key, trigger_spec, sort_order)
VALUES

-- ── Autumn and winter: the disease-led half of the year ──────────────
('copper_prefall',
 'Copper before the autumn rains',
 'Goes on before the rains start, not after. Anthracnose spores are released through autumn and winter wet and infect young bark, so this is protection ahead of the event. One dormant copper per season is the cap.',
 'disease', 'apple_anthracnose', 'copper',
 '{"type":"calendar","start":"09-15","end":"10-15"}', 10),

('canker_scouting',
 'Walk the limbs for new cankers',
 'Monthly through the wet half of the year, walking limbs rather than scanning from a distance. Count cankers per stem — the count is what drives the decision.',
 'monitoring', 'apple_anthracnose', NULL,
 '{"type":"calendar","start":"10-01","end":"03-31"}', 20),

('anthracnose_excision',
 'Carve out anthracnose cankers',
 'In DRY weather only. Quarter-inch margin of healthy bark, sterilise the blade between cankers, fresh Bordeaux paste (10-10-100) on the wound. Remove any stem carrying four or more; burn trees with four or more on most branches.',
 'disease', 'apple_anthracnose', 'bordeaux',
 '{"type":"calendar","start":"11-01","end":"02-28"}', 30),

('leaf_litter_sanitation',
 'Flail mow the leaves, then 5% urea',
 'The best value in the whole program: cuts overwintering scab inoculum by 50 to 80% for the cost of a pass with the mower. Do it once the leaves are down.',
 'sanitation', 'apple_scab', 'urea_sanitation',
 '{"type":"phenology","stage":"leaf_fall","windowDays":30}', 40),

('wild_host_removal',
 'Clear wild apple and hawthorn',
 'Within a quarter to half a mile. Apple maggot is by far the most serious west-side insect and wild hosts are where it lives; this is worth more than anything you can spray.',
 'sanitation', 'apple_maggot', NULL,
 '{"type":"calendar","start":"11-01","end":"02-28"}', 50),

('mildew_prune',
 'Prune out silvered mildew tips',
 'Mildew overwinters inside the buds of infected shoots, so the shoots you cut in dormancy are next spring''s inoculum. Look for silvered, stunted tips.',
 'sanitation', 'powdery_mildew', NULL,
 '{"type":"calendar","start":"01-01","end":"03-01"}', 60),

('crown_inspection',
 'Check crowns on the EMLA 106 block',
 'Cut the bark at and just below the soil line: dark slimy tissue with an orange-brown margin is Phytophthora. Those trees are in year 5 of the 3-to-8-year failure window, and recovery after visible decline is rare.',
 'monitoring', 'phytophthora', NULL,
 '{"type":"calendar","start":"12-01","end":"02-28"}', 70),

-- ── Spring: stage-anchored, wetness-driven ──────────────────────────
('copper_half_inch_green',
 'Copper at half-inch green',
 'The spring copper, ahead of the primary scab season.',
 'disease', 'apple_scab', 'copper',
 '{"type":"phenology","stage":"half_inch_green","windowDays":7}', 80),

('oil_half_inch_green',
 'Horticultural oil at 1 to 1.5%',
 'Smothers overwintering mites and aphid eggs. Keep 14 days clear of sulfur in both directions.',
 'insect', 'woolly_apple_aphid', 'horticultural_oil',
 '{"type":"phenology","stage":"half_inch_green","windowDays":10}', 90),

('scab_infection_watch',
 'Watch for scab infection periods',
 'Not a scheduled spray — a standing watch. An infection needs a Mills wetness period, roughly 6 to 11 hours wet at 50 to 60°F. Watch the wetness, not the calendar.',
 'monitoring', 'apple_scab', NULL,
 '{"type":"condition","kind":"scab_infection","fromStage":"green_tip","untilStage":"petal_fall"}', 100),

('lime_sulfur_primary',
 'Lime sulfur through primary scab',
 'The organic scab backbone west of the Cascades. Wettable sulfur does NOT control scab here — PNW-tested — so this is the material that does the work. Timed on wetness periods, through about two weeks past the last primary infection.',
 'disease', 'apple_scab', 'lime_sulfur',
 '{"type":"phenology","stage":"green_tip","untilStage":"petal_fall"}', 110),

('bloom_thinning_spray',
 'Bloom lime sulfur and oil',
 'One operation doing two jobs: WSU''s organic crop thinner at bloom, and scab protection at the same time. The rates overlap, so plan it as a single pass rather than two.',
 'disease', 'apple_scab', 'lime_sulfur',
 '{"type":"phenology","stage":"first_bloom","untilStage":"petal_fall"}', 120),

('mildew_sulfur',
 'Wettable sulfur for mildew',
 'Mildew is the one disease a dry site actively favours — it does not need free water. Sulfur is the right material here, and only here.',
 'disease', 'powdery_mildew', 'wettable_sulfur',
 '{"type":"phenology","stage":"green_tip","windowDays":75}', 130),

-- ── Codling moth: no-biofix degree days from January 1 ───────────────
('cm_oil_375',
 'Codling moth oil, 375 DD',
 'Topical ovicide. Port Angeles is north of 46°N, so the no-biofix model applies: degree-days accumulate from January 1 and the milestones are read straight off the running total.',
 'insect', 'codling_moth', 'horticultural_oil',
 '{"type":"degree_day","dd":375,"model":"gdd50_jan1","windowDays":7}', 140),

('cm_gen1_425',
 'Codling moth first generation, 425 DD',
 'First-generation egg hatch — the first treatment target. CpGV is the organic option; rotate strains, since resistance is documented in Washington.',
 'insect', 'codling_moth', 'cpgv',
 '{"type":"degree_day","dd":425,"model":"gdd50_jan1","windowDays":10}', 150),

('cm_gen2_1400',
 'Codling moth second generation, 1400 DD',
 'Second-generation hatch. Two generations is the norm at this latitude.',
 'insect', 'codling_moth', 'cpgv',
 '{"type":"degree_day","dd":1400,"model":"gdd50_jan1","windowDays":10}', 160),

-- ── Apple maggot: trap-driven, never calendar-driven ─────────────────
('red_spheres_hang',
 'Hang the red sphere traps',
 'Red spheres only. Snowberry maggot is indistinguishable from apple maggot in the field and is abundant on the Peninsula, so a trap that catches both tells you nothing — the sphere is the one that discriminates.',
 'monitoring', 'apple_maggot', NULL,
 '{"type":"calendar","start":"06-15","end":"07-05"}', 170),

('maggot_kaolin',
 'Kaolin once the spheres catch',
 'Kaolin is an oviposition deterrent, not a knockdown — it works by making the fruit an unattractive place to lay. Start on the first catch, not before, and keep the film intact.',
 'insect', 'apple_maggot', 'kaolin',
 '{"type":"threshold","trap":"red_sphere","count":1}', 180)

ON CONFLICT (key) DO NOTHING;
