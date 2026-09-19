-- Starter material library for a maritime-Washington cider orchard.
--
-- Sourced from the 2026-09 WSU-primary research (FS295E anthracnose,
-- EM117E cider orchard, EM066E west-side calendar, PNW handbook). Rates
-- are deliberately LEFT NULL: the label is the legal document and rates
-- vary by formulation — the app advises on timing, scope and intervals,
-- never on how much to mix.
--
-- Two findings are encoded structurally rather than as advice text:
--   * wettable sulfur does NOT list apple_scab as a target west of the
--     Cascades (it fails here) — lime sulfur is the scab backbone;
--   * copper carries max_per_season = 1 (one dormant application).

INSERT INTO spray_materials
  (material_key, name, material_type, active_ingredient, omri_listed, restricted_use,
   rei_hours, phi_days, targets, conflicts_with, conflict_days, max_per_season, notes)
VALUES
  ('lime_sulfur', 'Lime sulfur', 'fungicide', 'calcium polysulfide', TRUE, FALSE,
   48, NULL, ARRAY['apple_scab','powdery_mildew','apple_anthracnose'],
   ARRAY['horticultural_oil'], 14, NULL,
   'The scab backbone west of the Cascades. Bloom lime sulfur + oil doubles as WSU''s organic crop thinner — plan them as one operation.'),

  ('wettable_sulfur', 'Wettable sulfur', 'fungicide', 'sulfur', TRUE, FALSE,
   24, NULL, ARRAY['powdery_mildew'],
   ARRAY['horticultural_oil'], 14, NULL,
   'Mildew only here. PNW testing shows wettable sulfur does NOT control scab west of the Cascades — use lime sulfur for scab.'),

  ('copper', 'Fixed copper (Nu-Cop / basic copper sulfate)', 'fungicide', 'copper hydroxide / copper sulfate', TRUE, FALSE,
   24, NULL, ARRAY['apple_anthracnose','european_canker','apple_scab'],
   ARRAY[]::text[], NULL, 1,
   'One dormant application per season. Support for anthracnose — excision is the actual program (WSU''s own fungicide trial failed, 77% canker growth).'),

  ('horticultural_oil', 'Horticultural oil', 'insecticide', 'mineral oil', TRUE, FALSE,
   12, NULL, ARRAY['aphids','woolly_apple_aphid','scale','mites','codling_moth'],
   ARRAY['lime_sulfur','wettable_sulfur'], 14, NULL,
   '1–1.5% at half-inch green. Codling-moth ovicide at 375 DD. Ineffective on woolly apple aphid''s waxy colonies — conserve Aphelinus mali and earwigs instead.'),

  ('bt_kurstaki', 'Bt (Dipel / Bacillus thuringiensis kurstaki)', 'biological', 'Bacillus thuringiensis kurstaki', TRUE, FALSE,
   4, 0, ARRAY['leafrollers','apple_ermine_moth','tent_caterpillar','winter_moth'],
   ARRAY[]::text[], NULL, NULL,
   'Works on SMALL larvae — timing matters far more than product. Harmless to the predators this program depends on.'),

  ('cpgv', 'Codling moth granulovirus (CpGV)', 'biological', 'Cydia pomonella granulovirus', TRUE, FALSE,
   4, 0, ARRAY['codling_moth'],
   ARRAY[]::text[], NULL, NULL,
   'Organic codling-moth backbone. Resistance is documented in Washington — rotate strains. Short residual, so repeat on the degree-day schedule.'),

  ('spinosad_organic', 'Spinosad (Entrust, OMRI)', 'insecticide', 'spinosad', TRUE, FALSE,
   4, 7, ARRAY['leafrollers','apple_maggot','codling_moth','thrips'],
   ARRAY[]::text[], NULL, NULL,
   'Step up from Bt for leafrollers. Toxic to bees while wet — apply at dusk, never during bloom.'),

  ('kaolin', 'Kaolin clay (Surround WP)', 'deterrent', 'kaolin', TRUE, FALSE,
   4, 0, ARRAY['apple_maggot'],
   ARRAY[]::text[], NULL, NULL,
   'Oviposition deterrent for apple maggot — the serious west-side insect. Not a codling-moth tool. Needs reapplication after rain.'),

  ('insecticidal_soap', 'Insecticidal soap', 'insecticide', 'potassium salts of fatty acids', TRUE, FALSE,
   12, 0, ARRAY['aphids','mites'],
   ARRAY[]::text[], NULL, NULL,
   'Contact only — useless once rosy apple aphid has curled the leaf shut. The real window is delayed-dormant oil.'),

  ('phosphonate', 'Potassium phosphite / fosetyl-Al', 'fungicide', 'phosphorous acid salts', FALSE, FALSE,
   4, NULL, ARRAY['phytophthora'],
   ARRAY[]::text[], NULL, NULL,
   'Root and crown rot on susceptible rootstock (EMLA 106 / M.111). Most formulations are not OMRI-listed — check before use on a certified block.'),

  ('bordeaux', 'Bordeaux paste (10-10-100)', 'fungicide', 'copper sulfate + lime', TRUE, FALSE,
   24, NULL, ARRAY['apple_anthracnose','european_canker'],
   ARRAY[]::text[], NULL, NULL,
   'Painted on fresh excision wounds — mix fresh, it does not keep. Part of the knife-first anthracnose program (FS295E).'),

  ('urea_sanitation', 'Urea (leaf-litter sanitation, 5%)', 'nutrient', 'urea', TRUE, FALSE,
   4, NULL, ARRAY['apple_scab'],
   ARRAY[]::text[], NULL, NULL,
   'Autumn leaf-litter treatment with flail mowing: 50–80% cut in overwintering scab inoculum. The cheapest scab control there is.')
ON CONFLICT (material_key) DO NOTHING;
