-- Migration: variety_attributes grows into the full Variety Library
-- (curated-catalog layer), plus rootstock_attributes. Populated by the
-- Sept 2026 research pass; every field is owner-overridable.

ALTER TABLE variety_attributes ADD COLUMN IF NOT EXISTS ploidy VARCHAR(20);
ALTER TABLE variety_attributes ADD COLUMN IF NOT EXISTS harvest_window VARCHAR(80);
ALTER TABLE variety_attributes ADD COLUMN IF NOT EXISTS acidity VARCHAR(20);
ALTER TABLE variety_attributes ADD COLUMN IF NOT EXISTS tannin VARCHAR(20);
ALTER TABLE variety_attributes ADD COLUMN IF NOT EXISTS typical_sg VARCHAR(20);
ALTER TABLE variety_attributes ADD COLUMN IF NOT EXISTS vigor VARCHAR(20);
ALTER TABLE variety_attributes ADD COLUMN IF NOT EXISTS biennial_tendency VARCHAR(20);
ALTER TABLE variety_attributes ADD COLUMN IF NOT EXISTS disease_notes TEXT;
ALTER TABLE variety_attributes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE variety_attributes ADD COLUMN IF NOT EXISTS reference_sources TEXT;
ALTER TABLE variety_attributes ADD COLUMN IF NOT EXISTS confidence VARCHAR(10);

CREATE TABLE IF NOT EXISTS rootstock_attributes (
  rootstock VARCHAR(50) PRIMARY KEY,
  vigor_pct VARCHAR(30),
  precocity VARCHAR(30),
  anchorage VARCHAR(50),
  disease_notes TEXT,
  description TEXT,
  reference_sources TEXT,
  confidence VARCHAR(10),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
