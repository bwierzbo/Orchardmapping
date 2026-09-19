-- IPM phase 1: the material library, the application record, and the
-- per-orchard program mode that scopes which materials are offered.
--
-- Design notes that come straight from the 2026-09 WSU-primary research:
--   * Materials carry their own interval rules (sulfur and oil must be
--     14 days apart BOTH ways; only one dormant copper per season), so the
--     conflict engine is data-driven rather than hard-coded per product.
--   * `targets` holds pest/disease keys rather than free text so the
--     recommender can answer "what do I have for apple anthracnose?".
--   * Rates are stored as a low/high range in the label's own unit; the
--     label is the legal document, so the app advises and never invents.

-- How ambitious an orchard's program is allowed to be.
--   organic_practices  — prefer OMRI-listed, warn on anything else
--   certified_organic  — non-OMRI material is blocked outright
--   unrestricted       — everything, conventional included
ALTER TABLE orchards
  ADD COLUMN IF NOT EXISTS spray_program_mode TEXT NOT NULL DEFAULT 'organic_practices';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS spray_materials (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  manufacturer TEXT,
  epa_reg_no TEXT,
  -- fungicide | insecticide | miticide | biological | deterrent | nutrient | adjuvant
  material_type TEXT NOT NULL,
  active_ingredient TEXT,
  omri_listed BOOLEAN NOT NULL DEFAULT FALSE,
  restricted_use BOOLEAN NOT NULL DEFAULT FALSE,
  rei_hours NUMERIC,
  phi_days NUMERIC,
  rate_low NUMERIC,
  rate_high NUMERIC,
  rate_unit TEXT,
  -- pest/disease keys this material is used against
  targets TEXT[] NOT NULL DEFAULT '{}',
  -- material keys that must not be applied within `conflict_days`
  conflicts_with TEXT[] NOT NULL DEFAULT '{}',
  conflict_days INTEGER,
  -- hard cap per season (e.g. dormant copper = 1)
  max_per_season INTEGER,
  -- stable key used by rules/seeds so renaming the label doesn't break them
  material_key TEXT UNIQUE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS spray_applications (
  id SERIAL PRIMARY KEY,
  orchard_id TEXT NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  material_id INTEGER REFERENCES spray_materials(id),
  -- snapshot: the record must survive the library row being edited later
  material_name TEXT NOT NULL,
  material_key TEXT,
  applied_at TIMESTAMPTZ NOT NULL,
  target TEXT,
  rate_value NUMERIC,
  rate_unit TEXT,
  total_volume NUMERIC,
  total_volume_unit TEXT,
  -- free text ("Rows 1-8", "whole block") or an orchard_areas reference
  area_description TEXT,
  area_id INTEGER REFERENCES orchard_areas(id) ON DELETE SET NULL,
  applicator TEXT,
  applicator_license TEXT,
  air_temp_f NUMERIC,
  wind_mph NUMERIC,
  conditions TEXT,
  rei_hours NUMERIC,
  phi_days NUMERIC,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS spray_applications_orchard_idx
  ON spray_applications (orchard_id, applied_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS spray_applications_material_idx
  ON spray_applications (material_key, applied_at DESC);
