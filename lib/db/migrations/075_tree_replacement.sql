-- Migration: a tree can be taken out and another planted in its spot.
--
-- Until now the only ways to replant a spot were to edit the old tree into
-- the new one, which re-labels every bloom, pick and observation it ever
-- had as the new variety, or to delete it, which leaves that history
-- orphaned with no tree to open it from. Neither says when the old tree
-- came out or why.
--
-- A removed tree keeps its row, its id, its variety and its history. It
-- also keeps its address, so it can still say where it stood -- but it no
-- longer occupies it: address_key is NULL for a removed tree, the same way
-- it is for an unplaced one, so the spot is free for the tree planted in
-- its place. The new tree points back at the one it replaced.

ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS removed_on       DATE,
  ADD COLUMN IF NOT EXISTS removed_reason   TEXT,
  ADD COLUMN IF NOT EXISTS replaces_tree_id TEXT;

COMMENT ON COLUMN trees.removed_on IS
  'Day the tree was taken out of the ground. NULL = still standing. Set only through the replace route.';
COMMENT ON COLUMN trees.removed_reason IS
  'Why it came out, in the grower''s words ("snapped in half").';
COMMENT ON COLUMN trees.replaces_tree_id IS
  'The tree_id of the removed tree this one was planted in place of. No FK, like tree_events: ids are permanent and never reused.';

-- The generated column cannot have its expression changed in place on
-- every Postgres this runs on, so it is dropped and added back. The
-- constraint that depends on it goes and comes back with it.
ALTER TABLE trees DROP CONSTRAINT IF EXISTS trees_orchard_address_uniq;
ALTER TABLE trees DROP COLUMN IF EXISTS address_key;

ALTER TABLE trees ADD COLUMN address_key TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN removed_on IS NOT NULL THEN NULL
      WHEN block_id IS NULL AND row_id IS NULL AND position IS NULL THEN NULL
      ELSE coalesce(block_id, '') || chr(31) || coalesce(row_id, '') || chr(31) || coalesce(position, '')
    END
  ) STORED;

COMMENT ON COLUMN trees.address_key IS
  'Derived from block/row/position so uniqueness can be enforced on the whole address. NULL when the tree is unplaced or removed, which is why any number of those may share a spot.';

ALTER TABLE trees ADD CONSTRAINT trees_orchard_address_uniq
  UNIQUE (orchard_id, address_key) DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX IF NOT EXISTS trees_replaces_tree_id_idx
  ON trees (replaces_tree_id) WHERE replaces_tree_id IS NOT NULL;

ALTER TABLE tree_events DROP CONSTRAINT tree_events_event_type_check;
ALTER TABLE tree_events ADD CONSTRAINT tree_events_event_type_check CHECK (event_type IN (
  'created', 'updated', 'status_change', 'moved', 'deleted',
  'pruning', 'spray', 'fertilize', 'observation', 'harvest', 'note',
  'bloom', 'fruit_check', 'tree_condition', 'harvest_readiness',
  'harvest_complete', 'harvest_reopened',
  -- The old tree taken out, and the new one planted in its spot.
  'removed', 'replanted'
));
