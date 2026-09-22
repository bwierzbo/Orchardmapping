-- An orchard's program belongs to the orchard.
--
-- program_steps is one global calendar, and its own header says what that
-- means: "Steps are global, like pest_library — this is regional
-- agronomy, not per-orchard configuration." So every orchard in the
-- database is told to inspect "the EMLA 106 block" in December, which is
-- one planting at one site; to hang apple maggot spheres on 15 June,
-- which is a Peninsula emergence date; and to run one copper a season,
-- which is this owner's harvest-driven trade against WSU's recommended
-- two. The only escape was an on/off switch per step.
--
-- Now the global table is a RECOMMENDATION, tagged with the region it was
-- written for, and each orchard holds its own steps materialised from it.
-- From then on they are the orchard's: retime them, change the material,
-- delete them, add ones nobody recommended. A step remembers which
-- recommendation it came from and whether it has been changed since, so
-- the app can still say what was advised and where this orchard differs.

-- 1. The global steps become the rain shadow's recommendation.
ALTER TABLE program_steps
  ADD COLUMN IF NOT EXISTS region_key TEXT REFERENCES regions(key);

UPDATE program_steps SET region_key = 'olympic-rainshadow' WHERE region_key IS NULL;

COMMENT ON TABLE program_steps IS
  'The recommended program for a region. Orchards do not read this directly; they materialise it into orchard_program_steps and own the result.';

-- 2. Each orchard's own program.
CREATE TABLE IF NOT EXISTS orchard_program_steps (
  id              SERIAL PRIMARY KEY,
  orchard_id      TEXT NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,

  -- The recommended step this came from, and the region that recommended
  -- it. NULL means the orchard invented this step, which is allowed.
  source_step_key TEXT,
  recommended_by  TEXT REFERENCES regions(key),
  -- True once the orchard has changed it away from the recommendation.
  customised      BOOLEAN NOT NULL DEFAULT FALSE,

  title           TEXT NOT NULL,
  detail          TEXT,
  category        TEXT,
  pest_key        TEXT,
  material_key    TEXT,
  trigger_spec    JSONB NOT NULL,
  repeat_days     INTEGER,
  sort_order      INTEGER NOT NULL DEFAULT 100,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (orchard_id, key)
);

CREATE INDEX IF NOT EXISTS orchard_program_steps_orchard_idx
  ON orchard_program_steps (orchard_id, sort_order);

COMMENT ON TABLE orchard_program_steps IS
  'One orchard''s program. Materialised from its region''s recommendation, then owned and editable. customised = changed since it was adopted.';

-- 3. Materialise what every existing orchard is already running, so
-- nothing changes today. Carries across the per-step on/off choices that
-- lived in orchard_step_settings, including finn-hall's bloom-thinning
-- opt-out, which was hardcoded in migration 030.
INSERT INTO orchard_program_steps (
  orchard_id, key, source_step_key, recommended_by,
  title, detail, category, pest_key, material_key,
  trigger_spec, repeat_days, sort_order, enabled
)
SELECT o.id, s.key, s.key, s.region_key,
       s.title, s.detail, s.category, s.pest_key, s.material_key,
       s.trigger_spec, s.repeat_days, s.sort_order,
       COALESCE(oss.enabled, TRUE)
FROM orchards o
JOIN program_steps s ON s.region_key = o.region_key AND s.is_active
LEFT JOIN orchard_step_settings oss
  ON oss.orchard_id = o.id AND oss.step_key = s.key
ON CONFLICT (orchard_id, key) DO NOTHING;

COMMENT ON TABLE orchard_step_settings IS
  'DEPRECATED — superseded by orchard_program_steps.enabled (migration 057). Kept so an older deploy does not break mid-rollout.';
