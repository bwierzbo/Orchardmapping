-- How aggressively this orchard answers each threat, and whether the
-- material can actually deliver it.
--
-- Posture is not a preference dressed as a setting. It is constrained
-- by chemistry: a material can only be used retroactively if it has
-- POST-INFECTION activity. The PNW handbook is explicit that wettable
-- sulfur "has no post-infection activity, unlike liquid lime sulfur
-- formulations" — so a reactive posture backed by wettable sulfur is
-- not a strategy, it is a spray that arrives after it can do anything.
-- post_infection_hours is what lets the app say so before the season
-- rather than during a wetting event.
--
-- The four postures map onto trigger types the resolver already
-- understands, so this adds a decision rather than an engine:
--   protect   act before a forecast event
--   react     act after a confirmed one, inside the kickback window
--   evidence  act on a trap catch or a scouting count
--   off       a recorded decision, which the coverage check treats
--             differently from an oversight

ALTER TABLE spray_materials
  ADD COLUMN IF NOT EXISTS post_infection_hours INTEGER;
--> statement-breakpoint

-- Lime sulfur is the one material in this library with documented
-- kickback. The window is deliberately conservative and the app says
-- where it came from rather than implying a label citation.
UPDATE spray_materials
SET post_infection_hours = 48,
    notes = COALESCE(notes, '') || ' Has post-infection activity, unlike wettable sulfur — usable after an infection period has begun, within roughly 48 h as a conservative default; check the label.',
    updated_at = NOW()
WHERE material_key = 'lime_sulfur' AND post_infection_hours IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS orchard_pest_posture (
  orchard_id TEXT NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  pest_key TEXT NOT NULL REFERENCES pest_library(key) ON DELETE CASCADE,
  -- protect | react | evidence | off
  posture TEXT NOT NULL,
  -- light | moderate | severe: the least event worth acting on.
  -- RIMpro's own guidance ties this to whether the block had the
  -- disease last season, which this orchard's observation log informs.
  min_severity TEXT NOT NULL DEFAULT 'moderate',
  note TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (orchard_id, pest_key)
);
--> statement-breakpoint

-- Scab starts reactive for this orchard, which is what the programme
-- already does in practice: lime sulfur is timed on wetness periods
-- rather than sprayed on a calendar, and it is the material with the
-- kickback to make that legitimate.
INSERT INTO orchard_pest_posture (orchard_id, pest_key, posture, min_severity, note)
VALUES ('finn-hall', 'apple_scab', 'react', 'moderate',
  'Lime sulfur timed on wetness periods. Moderate rather than light because the block has no recorded scab history yet — revisit after a season of observations, which is how RIMpro sets the same threshold.')
ON CONFLICT (orchard_id, pest_key) DO NOTHING;
