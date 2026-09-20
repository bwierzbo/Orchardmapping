-- Nutrition: what the orchard is for, and what the lab said.
--
-- Leaf analysis is how a perennial crop's nutrient status is actually
-- known. Soil says what is present; leaf says what the tree took up,
-- and the two are read together — a nutrient can sit in the soil and
-- never reach the tree.
--
-- ON INTENT. The sufficiency ranges themselves do NOT vary by what the
-- fruit is for: WSU states they are "valid irrespective of cultivar,
-- rootstock, training system, and environmental conditions", and
-- inventing cider-specific numbers would be making up precision. What
-- intent changes is what a reading MEANS.
--
-- Nitrogen is the case that proves it. For dessert fruit the worry is
-- one-sided — high nitrogen costs colour and storage. For cider it cuts
-- both ways: juice nitrogen feeds the yeast, and below roughly 140 mg/L
-- of yeast-assimilable nitrogen a ferment can stick or throw hydrogen
-- sulfide, a threshold most apple musts already sit under. Yet keeved
-- traditional cider DEPENDS on low nitrogen to stall the ferment
-- deliberately, and vintage cultivars take up less to begin with. The
-- same low reading is a fault or the method depending on what is being
-- made, which the app should say rather than decide.

ALTER TABLE orchards
  ADD COLUMN IF NOT EXISTS fruit_purpose TEXT NOT NULL DEFAULT 'cider';
--> statement-breakpoint
ALTER TABLE orchards
  ADD COLUMN IF NOT EXISTS operation_scale TEXT NOT NULL DEFAULT 'small_business';
--> statement-breakpoint

-- Leaf tissue results. One row per composite sample, so a block-level
-- programme is several rows on the same date rather than a wider table.
CREATE TABLE IF NOT EXISTS tissue_tests (
  id SERIAL PRIMARY KEY,
  orchard_id TEXT NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  sampled_on DATE NOT NULL,
  /* Free text: "whole block", "Rows 1-8", a variety, a rootstock. */
  sample_area TEXT,
  lab TEXT,
  /* Percent of dry matter */
  n NUMERIC(6, 3), p NUMERIC(6, 3), k NUMERIC(6, 3),
  ca NUMERIC(6, 3), mg NUMERIC(6, 3), s NUMERIC(6, 3),
  /* ppm / mg per kg */
  b NUMERIC(8, 2), zn NUMERIC(8, 2), mn NUMERIC(8, 2),
  fe NUMERIC(8, 2), cu NUMERIC(8, 2),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tissue_tests_orchard_idx
  ON tissue_tests (orchard_id, sampled_on DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS soil_tests (
  id SERIAL PRIMARY KEY,
  orchard_id TEXT NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  sampled_on DATE NOT NULL,
  sample_area TEXT,
  lab TEXT,
  depth_inches NUMERIC(5, 1),
  ph NUMERIC(4, 2),
  organic_matter_pct NUMERIC(5, 2),
  /* ppm unless noted */
  p NUMERIC(8, 2), k NUMERIC(8, 2), ca NUMERIC(8, 2), mg NUMERIC(8, 2),
  b NUMERIC(8, 2), zn NUMERIC(8, 2), mn NUMERIC(8, 2), cu NUMERIC(8, 2),
  cec NUMERIC(8, 2),
  nitrate_n NUMERIC(8, 2),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS soil_tests_orchard_idx
  ON soil_tests (orchard_id, sampled_on DESC);
--> statement-breakpoint

-- Both are program steps, because both are timed work that should
-- appear in the due list rather than living in someone's memory. The
-- leaf sample is stage-anchored, which the trigger model already does:
-- 60 days past petal fall is late July here, and the point is that
-- nutrient levels are most stable between the end of shoot growth and
-- relocation — not a date on a calendar.
INSERT INTO program_steps
  (key, title, detail, category, pest_key, material_key, trigger_spec, repeat_days, sort_order)
VALUES
('leaf_tissue_sample',
 'Take the leaf tissue sample',
 'Sixty days past petal fall, which is when nutrient levels are most stable — after shoot growth has finished and before the tree starts pulling nutrients back out of the leaves. Take recently mature leaves from non-bearing spurs or new shoots, 50 to 100 of them from across the block rather than from the worst-looking trees. Sampling the same way each year matters more than the absolute numbers: the value is in the trend.',
 'monitoring', NULL, NULL,
 '{"type":"phenology","stage":"petal_fall","offsetDays":60,"windowDays":21}', NULL, 190),

('soil_test',
 'Soil test',
 'Every three years. A soil test says what is present and a leaf test says what the tree actually took up — a nutrient can sit in the soil and never reach the tree, which is why neither answers the question alone. Sample the same points each time.',
 'monitoring', NULL, NULL,
 '{"type":"calendar","start":"10-01","end":"11-30"}', 1095, 200)

ON CONFLICT (key) DO NOTHING;
