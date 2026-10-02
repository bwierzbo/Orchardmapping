-- Two things a walk could not record.
--
-- TREE CONDITION. The anthracnose programme here is knife-first: carve out
-- each canker with a margin, sterilise between cuts, burn a stem carrying
-- four or more. That is a count, per tree, followed over seasons -- and the
-- walk had nowhere to put it. Crown inspection existed only as a programme
-- step, which is advice to the orchard, not an observation of a tree. A
-- count recorded at the trunk is what tells you whether the cutting is
-- winning, and which trees are the inoculum source for the block.
--
-- HARVEST READINESS. The harvest predictor (migrations 066-068) places a
-- picking window from bloom and the variety's interval. Every number in it
-- is seeded; none is observed. The fastest way to find out whether a
-- prediction is any good is to ask the person standing at the tree, while
-- they are standing at it: pick now, a week, two weeks, not yet. Recorded
-- against the window that was predicted at the time, it is a calibration
-- signal that arrives weeks before the harvest date does.
ALTER TABLE tree_events DROP CONSTRAINT tree_events_event_type_check;
ALTER TABLE tree_events ADD CONSTRAINT tree_events_event_type_check CHECK (event_type IN (
  'created', 'updated', 'status_change', 'moved', 'deleted',
  'pruning', 'spray', 'fertilize', 'observation', 'harvest', 'note',
  'bloom', 'fruit_check',
  -- Trunk and scaffold: canker counts and what was cut out.
  'tree_condition',
  -- "When would you pick this?", beside what the model predicted.
  'harvest_readiness'
));

COMMENT ON TABLE tree_events IS
  'Everything that happened to one tree. Automatic audit rows plus observations from a walk; the structured payload of a walk pass lives in `changes`.';

-- Readiness is read back per variety and season to compare verdicts with
-- predictions, so it gets an index of its own rather than scanning the
-- whole history of every tree.
CREATE INDEX IF NOT EXISTS tree_events_readiness_idx
  ON tree_events (orchard_id, event_date DESC)
  WHERE event_type = 'harvest_readiness';
