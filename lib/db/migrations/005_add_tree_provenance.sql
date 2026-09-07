-- Migration: Tree provenance — what the tree is and where it came from.
-- rootstock: e.g. 'G-935', 'M111' — drives vigor/precocity comparisons
-- source: nursery or vendor the tree was purchased from
-- acquired_date: purchase date (distinct from planted_date)

ALTER TABLE trees ADD COLUMN IF NOT EXISTS rootstock VARCHAR(100);
ALTER TABLE trees ADD COLUMN IF NOT EXISTS source VARCHAR(200);
ALTER TABLE trees ADD COLUMN IF NOT EXISTS acquired_date DATE;
