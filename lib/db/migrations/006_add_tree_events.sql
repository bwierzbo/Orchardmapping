-- Migration: tree_events — per-tree history log (audit + field activities).
-- Supersedes the never-used tree_health_logs table (left in place; drop later).
--
-- tree_id is deliberately NOT a foreign key: history must survive tree
-- deletion (the 'deleted' event records the final snapshot).

CREATE TABLE IF NOT EXISTS tree_events (
  id SERIAL PRIMARY KEY,
  tree_id VARCHAR(100) NOT NULL,
  orchard_id VARCHAR(50) NOT NULL,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
    -- automatic (written by the API on data changes)
    'created', 'updated', 'status_change', 'moved', 'deleted',
    -- manual field activities
    'pruning', 'spray', 'fertilize', 'observation', 'harvest', 'note'
  )),
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  detail TEXT,
  changes JSONB,
  created_by VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tree_events_tree_idx
  ON tree_events (tree_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tree_events_orchard_date_idx
  ON tree_events (orchard_id, event_date DESC);
