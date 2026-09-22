-- What to do about a nutrient reading, and where that advice came from.
--
-- The app assesses a leaf test against WSU sufficiency ranges and stops:
-- it will tell you boron is low and say nothing about what to do. This is
-- where the answer goes.
--
-- The table ships EMPTY on purpose. A nutrient rate is the kind of number
-- that damages fruit when it is wrong, and cider especially — this repo
-- already carries a note that the 140 mg/L YAN figure everyone quotes is
-- a WINE standard borrowed for cider. So the structure exists and says
-- "no recommendation recorded" until somebody fills it from a source
-- worth citing. That is the same discipline as the region gate: silence
-- beats a confident number from nowhere.
--
-- Keyed by verdict rather than by value, because that is the decision
-- being made: a reading is deficient, adequate or excessive, and the
-- advice hangs off which.
--
-- region_key NULL means the advice holds anywhere. WSU's leaf sufficiency
-- ranges are explicitly of that kind — "valid irrespective of cultivar,
-- rootstock, training system, and environmental conditions" — while a
-- rate and a timing usually are not.

CREATE TABLE IF NOT EXISTS nutrient_recommendations (
  id           SERIAL PRIMARY KEY,
  region_key   TEXT REFERENCES regions(key) ON DELETE CASCADE,
  nutrient     TEXT NOT NULL,
  verdict      TEXT NOT NULL CHECK (verdict IN ('deficient', 'excessive')),

  title        TEXT NOT NULL,
  detail       TEXT,
  -- What to apply, if anything. A recommendation may be "do not fertilise
  -- for this; correct the soil pH instead", which has no material at all.
  material_key TEXT,
  rate_low     NUMERIC(10, 3),
  rate_high    NUMERIC(10, 3),
  rate_unit    TEXT,
  -- When, as a program trigger, so accepting one produces a real step
  -- rather than a note somebody has to remember.
  trigger_spec JSONB,

  source       TEXT,
  url          TEXT,
  quote        TEXT,
  confidence   TEXT NOT NULL DEFAULT 'medium'
               CHECK (confidence IN ('high', 'medium', 'low')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_key, nutrient, verdict)
);

CREATE INDEX IF NOT EXISTS nutrient_recommendations_lookup_idx
  ON nutrient_recommendations (nutrient, verdict);

COMMENT ON TABLE nutrient_recommendations IS
  'What to do about a deficient or excessive nutrient. Ships empty: a rate without a source is worse than no rate. region_key NULL = holds anywhere.';
COMMENT ON COLUMN nutrient_recommendations.trigger_spec IS
  'Optional program trigger, so accepting a recommendation creates a real step rather than a note to remember.';
