-- Pest & disease library, plus the observation log that turns the user's
-- own photos into a local reference collection.
--
-- `key` deliberately matches spray_materials.targets, so an entry can ask
-- "what do I have for this?" and get the answer already scoped to the
-- orchard's program mode — no second mapping table to drift out of sync.
--
-- `prevalence` is REGIONAL, not universal: this library is written for
-- maritime Washington in the Olympic rain shadow, where the ranking differs from
-- eastern-Washington guidance (apple maggot over codling moth, anthracnose
-- over everything, fire blight absent).

CREATE TABLE IF NOT EXISTS pest_library (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scientific_name TEXT,
  -- disease | insect | mite | vertebrate | beneficial
  category TEXT NOT NULL,
  -- high | moderate | low | absent | beneficial
  prevalence TEXT NOT NULL DEFAULT 'moderate',
  summary TEXT NOT NULL,
  symptoms TEXT,
  lookalikes TEXT,
  lifecycle TEXT,
  timing TEXT,
  monitoring TEXT,
  management TEXT,
  cider_note TEXT,
  refs TEXT[] NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
--> statement-breakpoint

-- What the user actually found, with their photo. Doubles as the scouting
-- record and as the orchard's own photo library for each entry — far more
-- useful than stock imagery for telling look-alikes apart.
CREATE TABLE IF NOT EXISTS pest_observations (
  id SERIAL PRIMARY KEY,
  orchard_id TEXT NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  pest_key TEXT REFERENCES pest_library(key) ON DELETE SET NULL,
  tree_id TEXT,
  photo_url TEXT,
  -- light | moderate | severe
  severity TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS pest_observations_orchard_idx
  ON pest_observations (orchard_id, observed_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pest_observations_key_idx
  ON pest_observations (pest_key, observed_at DESC);
