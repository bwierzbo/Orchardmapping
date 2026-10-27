-- Migration: more than one variety on a tree.
--
-- A tree had one variety. A Gala top-worked with a Chehalis limb could only
-- say "Gala" and put the Chehalis in a note, and every pick off it was
-- recorded as Gala.
--
-- The tree keeps its own variety -- what it was planted as. Each variety
-- grafted onto it is a row here, with where on the tree it is (a scaffold:
-- one of eight compass points and a tier, first being the lowest), the tag
-- on the limb if there is one, a photo, and whether it is still growing.
-- A tree with no rows is a one-variety tree and nothing about it changes.
--
-- Grafts often ripen weeks apart, so a grafted tree is picked out one
-- variety at a time. trees.harvest_completed_on keeps its meaning -- the
-- whole tree is picked out -- so the map and its filters are untouched; it
-- is now derived for a grafted tree from its varieties: the tree's own
-- (main_harvest_completed_on) and each growing graft's.

CREATE TABLE IF NOT EXISTS tree_grafts (
  id                   SERIAL PRIMARY KEY,
  -- No FK, like tree_events: tree ids are permanent and never reused.
  tree_id              TEXT NOT NULL,
  orchard_id           VARCHAR(50) NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  variety              VARCHAR(100) NOT NULL,
  scaffold_direction   TEXT CHECK (scaffold_direction IN ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW')),
  scaffold_tier        SMALLINT CHECK (scaffold_tier BETWEEN 1 AND 3),
  tag                  TEXT,
  grafted_on           DATE,
  status               TEXT NOT NULL DEFAULT 'growing' CHECK (status IN ('growing', 'failed', 'removed')),
  status_on            DATE,
  photo_url            TEXT,
  notes                TEXT,
  harvest_completed_on DATE,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tree_grafts_tree_id_idx ON tree_grafts (tree_id);

COMMENT ON COLUMN tree_grafts.scaffold_direction IS
  'Which side of the trunk the scaffold carrying the graft leaves from: one of eight compass points.';
COMMENT ON COLUMN tree_grafts.scaffold_tier IS
  'Which tier of scaffolds: 1 is the lowest.';
COMMENT ON COLUMN tree_grafts.tag IS
  'The tag on the limb, if there is one ("blue tape", "#14").';
COMMENT ON COLUMN tree_grafts.harvest_completed_on IS
  'This variety picked out; complete only for that calendar year, like trees.harvest_completed_on.';

-- The variety each pick was. NULL for a pick recorded before grafts
-- existed, which was the tree's own variety.
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS variety TEXT;

ALTER TABLE trees ADD COLUMN IF NOT EXISTS main_harvest_completed_on DATE;
COMMENT ON COLUMN trees.main_harvest_completed_on IS
  'The tree''s own variety picked out. Equal to harvest_completed_on on a tree with no grafts.';
UPDATE trees SET main_harvest_completed_on = harvest_completed_on
 WHERE harvest_completed_on IS NOT NULL;

ALTER TABLE tree_events DROP CONSTRAINT tree_events_event_type_check;
ALTER TABLE tree_events ADD CONSTRAINT tree_events_event_type_check CHECK (event_type IN (
  'created', 'updated', 'status_change', 'moved', 'deleted',
  'pruning', 'spray', 'fertilize', 'observation', 'harvest', 'note',
  'bloom', 'fruit_check', 'tree_condition', 'harvest_readiness',
  'harvest_complete', 'harvest_reopened',
  'removed', 'replanted',
  -- A variety grafted on, and a change to one (place, tag, status, photo).
  'graft_added', 'graft_changed'
));
