-- Estimating each variety's full bloom from a few indicator varieties.
--
-- Varieties bloom in a steady order but at a spacing that changes with the
-- spring, so the owner logs full bloom on three or four indicators spread
-- through the season and the rest are placed among them
-- (lib/bloom-estimate.ts). That needs two things the database lacked.

-- Where a variety sits in the bloom order when WSU Mount Vernon did not
-- measure it: its published flowering group, 1 (earliest) to 7 (latest),
-- on the UK National Fruit Collection scale, with the source it came from.
ALTER TABLE variety_attributes
  ADD COLUMN IF NOT EXISTS flowering_group SMALLINT
    CHECK (flowering_group BETWEEN 1 AND 7),
  ADD COLUMN IF NOT EXISTS flowering_group_source TEXT;

-- The trees the owner watches for full bloom each spring. A flag on the
-- tree rather than a list of varieties, because it is a particular tree --
-- one walked past, away from a frost pocket -- that gets looked at.
ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS bloom_indicator BOOLEAN NOT NULL DEFAULT FALSE;
