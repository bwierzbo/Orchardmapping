-- Migration: a harvest recorded at one tree.
--
-- 012 made a harvest a group action: pick a scope, record one aggregate
-- weight, fan an event out to every tree in it. That is right for clearing a
-- block, and useless for the thing that actually happens while inspecting --
-- standing at one tree with a full bin, wanting to say what came off THIS
-- tree. group_action_id was NOT NULL, so there was no way to write one.
--
-- Quantity and unit are kept as entered alongside the normalised weight_lbs.
-- A grower counts bushels; converting on the way in and showing pounds back
-- is how a recorded 3 becomes an unrecognisable 126.

ALTER TABLE harvests ALTER COLUMN group_action_id DROP NOT NULL;

ALTER TABLE harvests ADD COLUMN IF NOT EXISTS tree_id VARCHAR(100);
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS quantity DECIMAL(10, 2);
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS unit VARCHAR(10);

-- A harvest belongs to a group action or to a tree. Neither is a row that
-- cannot be traced back to anything.
ALTER TABLE harvests DROP CONSTRAINT IF EXISTS harvests_source_check;
ALTER TABLE harvests ADD CONSTRAINT harvests_source_check
  CHECK (group_action_id IS NOT NULL OR tree_id IS NOT NULL);

ALTER TABLE harvests DROP CONSTRAINT IF EXISTS harvests_unit_check;
ALTER TABLE harvests ADD CONSTRAINT harvests_unit_check
  CHECK (unit IS NULL OR unit IN ('bushel', 'lb', 'kg'));

CREATE INDEX IF NOT EXISTS harvests_tree_date_idx
  ON harvests (tree_id, harvest_date DESC);
