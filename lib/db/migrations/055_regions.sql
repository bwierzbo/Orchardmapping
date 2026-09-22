-- A region is a bundle of settings, not a bundle of steps.
--
-- The agronomy in this app was written for one microclimate and applied
-- everywhere: chill accumulating Nov 1 to Apr 30, codling moth counted
-- from January 1 on the no-biofix model, scab run on a high-inoculum
-- assumption, fire blight dismissed. Each of those is defensible in the
-- Olympic rain shadow and wrong somewhere else, and none of them could be
-- stated as a choice because there was nowhere to put one.
--
-- Settings rather than steps because that is how the agronomy actually
-- varies. WSU does not publish a different spray calendar for western
-- Washington; it runs the same models with different parameters — a
-- high-inoculum scab model here, low-inoculum in the central valleys. A
-- region that owns the parameters can compute a program. A region that
-- owns a copy of a program can only drift from it.
--
-- Vocabulary is the EPA/Omernik ecoregion hierarchy, which is the
-- accepted map and already names this microclimate: Level III 2 (Puget
-- Lowland), Level IV 2d (Olympic Rainshadow).
--
-- A region is a SUGGESTION for an orchard, never derived silently. The
-- published boundary of 2d runs east through Port Townsend to Whidbey,
-- so whether a given orchard belongs to it is a judgement its owner is
-- better placed to make than its coordinates are.

CREATE TABLE IF NOT EXISTS regions (
  key               TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  -- EPA Level IV code and its Level III parent, where one applies
  ecoregion_code    TEXT,
  ecoregion_parent  TEXT,
  description       TEXT,

  -- Chill accumulation window. Hemisphere- and climate-specific: a
  -- continental orchard is accumulating chill well before November.
  chill_start_mmdd  TEXT NOT NULL DEFAULT '11-01',
  chill_end_mmdd    TEXT NOT NULL DEFAULT '04-30',

  -- Codling moth. The no-biofix model is valid north of about 46°N,
  -- where January and February contribute too little heat above 50°F to
  -- matter. South of that a biofix is required and counting from Jan 1
  -- calls first hatch early by days to weeks.
  cm_accumulation   TEXT NOT NULL DEFAULT 'jan1'
                    CHECK (cm_accumulation IN ('jan1', 'biofix')),
  cm_generations    INTEGER,

  -- Apple scab. WSU runs a low-inoculum model in central Washington and
  -- a high-inoculum one in the wetter west.
  scab_inoculum     TEXT CHECK (scab_inoculum IN ('low', 'high')),

  -- Wetness proxies for the Mills model. Recorded here so a region can
  -- state them; they are not yet read by lib/scab.ts, which still holds
  -- values tuned against one orchard's seasons.
  wetness_rh_pct        NUMERIC(4, 1),
  wetness_precip_mm     NUMERIC(4, 2),
  wetness_break_hours   INTEGER,
  modelled_leaf_wetness BOOLEAN NOT NULL DEFAULT FALSE,

  source            TEXT,
  url               TEXT,
  confidence        TEXT NOT NULL DEFAULT 'medium'
                    CHECK (confidence IN ('high', 'medium', 'low')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE regions IS
  'Agronomic settings for a climate. A region computes a program; it does not store a copy of one.';
COMMENT ON COLUMN regions.cm_accumulation IS
  'jan1 = the no-biofix model, valid north of about 46 degrees. biofix = count from first sustained moth catch.';

ALTER TABLE orchards
  ADD COLUMN IF NOT EXISTS region_key TEXT REFERENCES regions(key);

COMMENT ON COLUMN orchards.region_key IS
  'Suggested from coordinates, always the owner''s to override. NULL means no region has been chosen, and the program should not be offered.';

-- The region this app was written for, carrying exactly the values it
-- already used. Nothing changes behaviour today; they simply stop being
-- assumptions and start being a choice that can be seen and changed.
INSERT INTO regions (
  key, name, ecoregion_code, ecoregion_parent, description,
  chill_start_mmdd, chill_end_mmdd,
  cm_accumulation, cm_generations, scab_inoculum,
  wetness_rh_pct, wetness_precip_mm, wetness_break_hours, modelled_leaf_wetness,
  source, url, confidence
) VALUES (
  'olympic-rainshadow', 'Olympic Rainshadow', '2d', '2 Puget Lowland',
  'The dry belt in the lee of the Olympic Mountains — Sequim at roughly 16-18 inches of rain a year against Seattle''s 37, running east through Port Townsend to Whidbey and Camano and north to the San Juans. Cool maritime winters, dry sunny late summers, and cider varieties ripening weeks ahead of their English and eastern reference dates.',
  '11-01', '04-30',
  'jan1', 2, 'high',
  90.0, 0.2, 4, FALSE,
  'WSU Mount Vernon-primary research pass, Sept 2026; EPA Level IV ecoregions',
  'https://www.epa.gov/eco-research/ecoregions',
  'medium'
)
ON CONFLICT (key) DO NOTHING;

-- Every orchard that exists today really is in the rain shadow — they sit
-- within a few miles of each other on the Olympic Peninsula.
UPDATE orchards SET region_key = 'olympic-rainshadow' WHERE region_key IS NULL;
