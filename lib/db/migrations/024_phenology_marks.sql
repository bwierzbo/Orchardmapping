-- When the orchard reached each growth stage, observed rather than
-- assumed.
--
-- Most of a west-side program is stage-anchored — copper at half-inch
-- green, lime sulfur through bloom, the wound window at leaf fall — and
-- the dates move by a fortnight year to year, so no calendar can place
-- those steps without this table.
--
-- observed_on is a DATE, not a timestamp: a stage is something the block
-- reaches over a day or two, and storing a spurious clock time would
-- invite the timezone day-shift lib/dates.ts exists to avoid.

CREATE TABLE IF NOT EXISTS phenology_marks (
  id SERIAL PRIMARY KEY,
  orchard_id TEXT NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  -- one of lib/phenology.ts PHENOLOGY_STAGES
  stage TEXT NOT NULL,
  observed_on DATE NOT NULL,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
--> statement-breakpoint

-- A stage happens once a season, and the season key is the calendar year
-- (safe for the northern-hemisphere apple cycle). This turns a
-- double-tap into an update rather than a second, contradictory date.
CREATE UNIQUE INDEX IF NOT EXISTS phenology_marks_season_idx
  ON phenology_marks (orchard_id, stage, (date_part('year', observed_on)));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS phenology_marks_orchard_idx
  ON phenology_marks (orchard_id, observed_on DESC);
