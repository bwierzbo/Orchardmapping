-- Growth stages are recorded per VARIETY, and the programme still
-- produces one spray date for the whole block.
--
-- A single orchard-wide date was wrong for a block of eighteen
-- varieties: late bittersweets trail the early ones, and petal fall is
-- the anchor that closes the scab window and opens the mildew one. But
-- the owner does not want eighteen spray schedules for three acres, and
-- would be right not to — so variety is the unit of OBSERVATION and the
-- whole block stays the unit of ACTION.
--
-- A stage is declared for a group when most of it is there, not when
-- the last tree catches up. That is the published convention rather
-- than a simplification: full bloom is defined as 70-80% of blossoms
-- open, "an averaged classification". The help text already said as
-- much without explaining it was a rule about the group.
--
-- scope keeps the orchard-wide option working. Anyone with one variety,
-- or a block that moves together, should not be made to pick a variety
-- from a list to record one date.

ALTER TABLE phenology_marks
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'orchard';
--> statement-breakpoint
ALTER TABLE phenology_marks
  ADD COLUMN IF NOT EXISTS scope_value TEXT;
--> statement-breakpoint

-- The old index allowed one row per stage per season for the whole
-- orchard. Now it is one row per stage per season per group.
DROP INDEX IF EXISTS phenology_marks_season_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS phenology_marks_scope_season_idx
  ON phenology_marks (
    orchard_id, scope, COALESCE(scope_value, ''), stage,
    (date_part('year', observed_on))
  );
--> statement-breakpoint

-- How this orchard groups its stage observations. Variety by default,
-- because varieties here span rows and start mid-row, so rows are not
-- the natural unit. Block stays available for anyone planted that way.
ALTER TABLE orchards
  ADD COLUMN IF NOT EXISTS phenology_scope TEXT NOT NULL DEFAULT 'variety';
