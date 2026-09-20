-- Copper's re-entry interval was wrong by half.
--
-- It was recorded as 24 hours. The PNW handbook lists 48-hour re-entry
-- for every fixed copper on apple — Basic Copper 53, C-O-C-S WDG,
-- Nu-Cop 50 DF and Cuprofix Ultra alike. A re-entry interval is the
-- number that decides when a person may walk back into a treated block,
-- so being wrong by half is not a rounding error, and it errs in the
-- direction of sending someone in too early.
--
-- The rate encoded elsewhere is confirmed exactly: Nu-Cop 50 DF at
-- "12 to 16 lb/A", with the handbook adding a constraint nothing had
-- captured — do not use it where soil pH is 5.5 or below, which is
-- worth knowing for a maritime orchard and is now in the notes.

UPDATE spray_materials
SET rei_hours = 48,
    notes = COALESCE(notes, '') || ' PNW lists 48-hour re-entry for every fixed copper on apple. Nu-Cop 50 DF is 12-16 lb/A and must not be used where soil pH is 5.5 or below — worth checking against a soil test before ordering.',
    updated_at = NOW()
WHERE material_key = 'copper';
--> statement-breakpoint

-- Bordeaux is the same chemistry painted on a wound rather than sprayed,
-- and carries the same re-entry.
UPDATE spray_materials
SET rei_hours = 48, updated_at = NOW()
WHERE material_key = 'bordeaux' AND rei_hours < 48;
--> statement-breakpoint

-- The anthracnose step records what the handbook actually recommends,
-- which is NOT what this orchard is doing.
--
-- PNW: "Apply materials before fall rains and again (about 1 month
-- later) when leaves fall from trees." Two applications. This programme
-- runs one, at leaf fall, because the pre-rain timing collided with a
-- late cider harvest — the rains here beat the fruit off the tree by
-- four to eight weeks every year, so that spray would land on a full
-- crop of a material whose pre-harvest interval is not published.
--
-- That trade-off stands, but it should be visible rather than implied:
-- the orchard is running half the recommended anthracnose copper
-- programme, and the monthly canker walk is what will say whether it
-- was affordable. The per-season cap of one would also block the second
-- application, so raising it is part of any decision to add it back.
UPDATE program_steps
SET detail = detail || ' NOTE: the PNW handbook recommends TWO copper applications for anthracnose — before the fall rains and again about a month later at leaf fall. This orchard runs only the leaf-fall one, because the pre-rain timing lands on a full crop of late cider varieties. That is a deliberate trade, not an oversight, and the canker count is what tests it.',
    updated_at = NOW()
WHERE key = 'copper_leaf_fall'
  AND detail NOT LIKE '%recommends TWO copper applications%';
