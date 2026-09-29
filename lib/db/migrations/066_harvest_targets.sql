-- Predicting when a variety wants picking.
--
-- Harvest date is anchored to full bloom, not to the calendar: the interval
-- from bloom to picking holds steady for a cultivar while the calendar date
-- moves a fortnight with the spring. Three things are needed and two of
-- them did not exist.

-- 1. What the fruit is for.
--
-- A cider apple and an eating apple off the same tree want picking at
-- different times: fresh fruit comes off firm and before full ripeness so
-- it stores, cider fruit comes off with the starch converted and the sugar
-- and tannin up, and fruit gathered off the ground still presses. Published
-- maturity guidance is written for the fresh market and will tell a
-- cidermaker to pick early, so this cannot be left implicit.
--
-- Defaulting to 'fresh' because that is the general case for an orchard
-- someone has simply mapped. The two orchards run as a cidery are set
-- below; the rest belong to other people and stay on the default.
ALTER TABLE orchards
  ADD COLUMN IF NOT EXISTS harvest_purpose TEXT NOT NULL DEFAULT 'fresh';

ALTER TABLE orchards DROP CONSTRAINT IF EXISTS orchards_harvest_purpose_check;
ALTER TABLE orchards
  ADD CONSTRAINT orchards_harvest_purpose_check
  CHECK (harvest_purpose IN ('fresh', 'cider'));

COMMENT ON COLUMN orchards.harvest_purpose IS
  'What the fruit here is for, which sets the maturity target and the width of the picking window. Overridable per view.';

UPDATE orchards SET harvest_purpose = 'cider'
WHERE name IN ('Olympic Bluffs Cidery', 'Farm House Orchard');

-- 2. Bloom, per variety.
--
-- A phenology mark was one row per orchard per stage per season, which is
-- right for the stages a whole block passes through together -- green tip,
-- petal fall, leaf fall. Full bloom is not one of those: the eight cider
-- varieties whose bloom WSU Mount Vernon records span 19 April to 22 May,
-- over a month. An orchard-wide bloom date would blur every prediction
-- resting on it by up to a fortnight.
--
-- So a mark may now name a variety and a block, or leave both null and mean
-- the whole orchard as before.
ALTER TABLE phenology_marks
  ADD COLUMN IF NOT EXISTS variety  TEXT,
  ADD COLUMN IF NOT EXISTS block_id TEXT;

-- The old index allowed one mark per stage per season. Replaced rather than
-- added to: with variety and block nullable, Postgres treats two NULLs as
-- distinct and the same orchard-wide mark could be recorded twice, which is
-- exactly the contradictory pair the original index existed to prevent.
DROP INDEX IF EXISTS phenology_marks_season_idx;
CREATE UNIQUE INDEX IF NOT EXISTS phenology_marks_season_idx
  ON phenology_marks (
    orchard_id,
    stage,
    (date_part('year', observed_on)),
    (COALESCE(lower(btrim(variety)), '')),
    (COALESCE(lower(btrim(block_id)), ''))
  );

COMMENT ON COLUMN phenology_marks.variety IS
  'Narrows the mark to one variety. Null means the whole orchard, as before. Full bloom needs this; cultivars bloom a month apart.';

-- 3. The interval itself, per variety and purpose.
--
-- Layered the way the variety library is: site_id null is the curated row
-- everyone sees, site_id set is this site''s own. A site''s own value wins,
-- which is how an observed local interval comes to replace a seeded one
-- without editing anybody else''s.
CREATE TABLE IF NOT EXISTS variety_harvest_targets (
  id                SERIAL PRIMARY KEY,
  variety           TEXT NOT NULL,
  site_id           TEXT REFERENCES sites(id) ON DELETE CASCADE,
  purpose           TEXT NOT NULL CHECK (purpose IN ('fresh', 'cider')),

  -- Centre of the window, counted from full bloom.
  days_from_bloom   INTEGER NOT NULL CHECK (days_from_bloom BETWEEN 60 AND 260),

  -- Optional and better in a cool year: a degree-day total absorbs a slow
  -- summer that a day count cannot.
  gdd_from_bloom    NUMERIC(7, 1),

  -- What says "now" once fruit is being sampled. Starch on the 1-8 scale
  -- the inspection form uses.
  starch_target     NUMERIC(3, 1) CHECK (starch_target IS NULL OR starch_target BETWEEN 1 AND 8),
  brix_target       NUMERIC(4, 1),

  -- Where the number came from. Never hidden in the UI: a figure read off
  -- the word "Late" must not pass for one measured at a research station.
  basis             TEXT NOT NULL CHECK (basis IN ('observed', 'wsu_paired', 'text_date', 'season_word')),
  detail            TEXT,
  -- How many local harvests it rests on. 0 for everything seeded.
  sample_count      INTEGER NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per variety per purpose per layer, case-insensitively -- the same
-- rule the variety library uses, and for the same reason.
CREATE UNIQUE INDEX IF NOT EXISTS variety_harvest_targets_uniq
  ON variety_harvest_targets (lower(btrim(variety)), purpose, (COALESCE(site_id, '')));

CREATE INDEX IF NOT EXISTS variety_harvest_targets_lookup
  ON variety_harvest_targets (lower(btrim(variety)), purpose);
