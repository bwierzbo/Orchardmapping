-- Migration: harvest records. A harvest is a group action (scope filter +
-- per-tree event fan-out) carrying quantitative data: weight and juice
-- measurements. The harvests row holds the aggregate; tree_events rows
-- mark which trees were picked.

ALTER TABLE group_actions DROP CONSTRAINT group_actions_action_kind_check;
ALTER TABLE group_actions ADD CONSTRAINT group_actions_action_kind_check
  CHECK (action_kind IN ('log_event', 'set_field', 'harvest'));

CREATE TABLE IF NOT EXISTS harvests (
  id SERIAL PRIMARY KEY,
  orchard_id VARCHAR(50) NOT NULL,
  group_action_id INTEGER NOT NULL,
  harvest_date DATE NOT NULL,
  weight_lbs DECIMAL(10, 1) NOT NULL,
  brix DECIMAL(4, 1),
  sg DECIMAL(6, 4),
  ph DECIMAL(4, 2),
  notes TEXT,
  created_by VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  undone_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS harvests_orchard_date_idx
  ON harvests (orchard_id, harvest_date DESC);
