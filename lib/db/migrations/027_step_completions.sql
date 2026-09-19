-- What has actually been done, so the schedule stops nagging.
--
-- Two things a plan needs that the steps alone can't express:
--
-- 1. repeat_days. Most steps happen once a season, but some recur —
--    canker scouting is monthly through the wet half of the year, and
--    lime sulfur goes on repeatedly as wetness periods arrive. A step
--    with repeat_days falls due again that many days after it was last
--    done; NULL means once per season.
--
-- 2. Completions. Many rows per step per season on purpose: a recurring
--    step needs its history, not just its latest date.
--
-- A recorded spray application ALSO completes a step — see
-- lib/db/schedule.ts, which feeds both sources into the resolver as one
-- list. This table is for the work that isn't a spray: excision,
-- mowing, hanging traps, walking the rows.

ALTER TABLE program_steps
  ADD COLUMN IF NOT EXISTS repeat_days INTEGER;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS program_step_completions (
  id SERIAL PRIMARY KEY,
  orchard_id TEXT NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL REFERENCES program_steps(key) ON DELETE CASCADE,
  completed_on DATE NOT NULL,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS step_completions_orchard_idx
  ON program_step_completions (orchard_id, completed_on DESC);
--> statement-breakpoint

-- Tapping "done" twice on the same day is a double-tap, not two jobs.
CREATE UNIQUE INDEX IF NOT EXISTS step_completions_once_a_day_idx
  ON program_step_completions (orchard_id, step_key, completed_on);
--> statement-breakpoint

-- The two genuinely recurring steps in the seeded program.
UPDATE program_steps SET repeat_days = 30 WHERE key = 'canker_scouting';
--> statement-breakpoint
UPDATE program_steps SET repeat_days = 10 WHERE key = 'lime_sulfur_primary';
