-- Not every orchard in this database is one you run.
--
-- Five of the six orchards here belong to other people. Mapping
-- somebody's trees, recording what you saw and helping them find a
-- variety is useful to them; telling them when to spray is not yours to
-- do, and the owner does not want to see or carry those decisions on
-- another grower's behalf. The program also carries worker re-entry
-- intervals, which is the last thing to hand out by accident.
--
-- So the two sides an orchard OPTS IN to are now switches on the
-- orchard, not something every orchard gets for having a region.
--
-- Note what does NOT move: the region itself, the pest library, the
-- variety library, walks, harvests, traps and the map. Those are
-- reference and record-keeping, the same work whoever owns the trees.
-- Only the two things that amount to "a programme you are running"
-- become optional.

ALTER TABLE orchards
  ADD COLUMN IF NOT EXISTS ipm_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS nutrition_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN orchards.ipm_enabled IS
  'Does this orchard run a spray/IPM programme here? Default FALSE: an orchard you have just mapped is not one you have committed to spraying, and opt-in is the safe direction for advice with re-entry intervals attached. One toggle on the dashboard turns it on.';

COMMENT ON COLUMN orchards.nutrition_enabled IS
  'Does this orchard run a nutrition programme here? Same opt-in reasoning as ipm_enabled.';

-- This deployment's current state, from the owner: the two orchards
-- they actually run. Everything else stays off until its owner asks.
-- finn-hall is Olympic Bluffs Cidery; washington is Farm House Orchard.
UPDATE orchards SET ipm_enabled = TRUE, nutrition_enabled = TRUE
WHERE id IN ('finn-hall', 'washington');
