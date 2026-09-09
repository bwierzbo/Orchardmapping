-- Migration: group actions — apply an event or a field change to a
-- filtered set of trees (rows/variety/status/block/whole orchard) as one
-- logical action, fanned out to per-tree tree_events for complete
-- per-tree history. Undo works through the recorded diffs.

CREATE TABLE IF NOT EXISTS group_actions (
  id SERIAL PRIMARY KEY,
  orchard_id VARCHAR(50) NOT NULL,
  action_kind VARCHAR(20) NOT NULL CHECK (action_kind IN ('log_event', 'set_field')),
  -- The filter used, verbatim, for display ("rows 6-14, Kingston Black")
  scope JSONB NOT NULL,
  -- log_event payload
  event_type VARCHAR(30),
  event_date DATE,
  detail TEXT,
  -- set_field payload
  field VARCHAR(50),
  value TEXT,
  tree_count INTEGER NOT NULL DEFAULT 0,
  created_by VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  undone_at TIMESTAMP WITH TIME ZONE,
  undone_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS group_actions_orchard_idx
  ON group_actions (orchard_id, created_at DESC);

-- Link fan-out events back to their group; undone events stay for audit
-- but are hidden from tree history.
ALTER TABLE tree_events ADD COLUMN IF NOT EXISTS group_action_id INTEGER;
ALTER TABLE tree_events ADD COLUMN IF NOT EXISTS undone_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS tree_events_group_idx ON tree_events (group_action_id);
