-- Migration: the research pass returns nuanced ranges with caveats
-- ("55-65% of seedling; comparable to MM.106 …"), not single tokens.
-- Widen the library's descriptive columns to TEXT.

ALTER TABLE rootstock_attributes ALTER COLUMN vigor_pct TYPE TEXT;
ALTER TABLE rootstock_attributes ALTER COLUMN precocity TYPE TEXT;
ALTER TABLE rootstock_attributes ALTER COLUMN anchorage TYPE TEXT;
ALTER TABLE variety_attributes ALTER COLUMN harvest_window TYPE TEXT;
ALTER TABLE variety_attributes ALTER COLUMN typical_sg TYPE TEXT;
ALTER TABLE variety_attributes ALTER COLUMN ripen_hint TYPE TEXT;
ALTER TABLE variety_attributes ALTER COLUMN origin TYPE TEXT;
