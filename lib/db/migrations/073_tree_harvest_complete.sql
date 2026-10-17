-- Migration: a tree can be marked picked out for the season.
--
-- 072 let a harvest be recorded at one tree, and a tree is rarely picked in
-- one go: the early fruit, then the rest a week or two later, then the
-- stragglers. So a season is several picks added together, and no total
-- can say whether the tree is finished -- 40 lb might be all of it or half.
-- The grower says so, and this is where it is kept.
--
-- A date rather than a flag. A tree counts as complete for the season the
-- date falls in, so every tree opens again on its own in January and nobody
-- has to remember to reset the orchard. NULL is "not finished", including
-- after a reopen.
--
-- Not in the tree edit form's column whitelist: it is set by its own route,
-- which writes a harvest_complete / harvest_reopened event every time.

ALTER TABLE trees ADD COLUMN IF NOT EXISTS harvest_completed_on DATE;

COMMENT ON COLUMN trees.harvest_completed_on IS
  'Day the tree was marked picked out. Complete only for that calendar year; NULL = not finished.';

ALTER TABLE tree_events DROP CONSTRAINT tree_events_event_type_check;
ALTER TABLE tree_events ADD CONSTRAINT tree_events_event_type_check CHECK (event_type IN (
  'created', 'updated', 'status_change', 'moved', 'deleted',
  'pruning', 'spray', 'fertilize', 'observation', 'harvest', 'note',
  'bloom', 'fruit_check', 'tree_condition', 'harvest_readiness',
  -- trees.harvest_completed_on set, and cleared again.
  'harvest_complete', 'harvest_reopened'
));
