-- One orchard's spray limits, kept out of everybody else's.
--
-- spray_materials.max_per_season is global, and copper's was 1. The
-- provenance row says exactly what that number is:
--
--   "The handbook actually recommends TWO anthracnose coppers — before
--    fall rains and again at leaf fall. This orchard runs one for harvest
--    reasons; the cap would block adding the second back."
--
-- So a harvest-driven trade at Finn Hall was silently halving the copper
-- programme of every other orchard in the database, and the warning it
-- produced cited a limit nobody else had chosen. Worse, the cap was the
-- thing that would stop them adding the second application back.
--
-- The material now carries what the handbook recommends. An orchard that
-- runs something different says so, in its own row, with the reason.

CREATE TABLE IF NOT EXISTS orchard_material_settings (
  orchard_id     TEXT NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  material_key   TEXT NOT NULL,
  -- NULL means "no cap here", which is different from "not set": the
  -- absence of a row is what means the recommendation applies.
  max_per_season INTEGER,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (orchard_id, material_key)
);

COMMENT ON TABLE orchard_material_settings IS
  'Per-orchard overrides of a material''s limits. No row = the recommended limit applies.';

-- The recommendation, as published.
UPDATE spray_materials SET max_per_season = 2, updated_at = NOW()
WHERE material_key = 'copper';

-- Finn Hall's own choice, as a choice.
INSERT INTO orchard_material_settings (orchard_id, material_key, max_per_season, note)
VALUES (
  'finn-hall', 'copper', 1,
  'One copper a season rather than the recommended two, for harvest reasons — the second would fall too close to picking on this block''s late cider varieties. Recorded here so it stays this orchard''s decision.'
)
ON CONFLICT (orchard_id, material_key) DO NOTHING;

-- The provenance row described a global value that is no longer global.
UPDATE value_provenance
SET value_text = '2',
    confidence = 'quoted',
    note = 'The PNW handbook recommends two anthracnose coppers — before fall rains and again at leaf fall. Finn Hall runs one for harvest reasons, which is now recorded as that orchard''s own setting rather than as everyone''s limit (migration 058).'
WHERE subject = 'spray_materials.copper.max_per_season';
