-- Migration: survey pass support + app settings.
--
-- 1. tree_events gains the walk-survey event types: bloom (phenology
--    stage observations) and fruit_check (crop load + measurements).
-- 2. app_settings: key/value JSONB store for user configuration —
--    the "capability-complete, configuration-scoped" foundation
--    (mirrors CiderPilot's system_settings pattern).

ALTER TABLE tree_events DROP CONSTRAINT tree_events_event_type_check;
ALTER TABLE tree_events ADD CONSTRAINT tree_events_event_type_check CHECK (event_type IN (
  'created', 'updated', 'status_change', 'moved', 'deleted',
  'pruning', 'spray', 'fertilize', 'observation', 'harvest', 'note',
  'bloom', 'fruit_check'
));

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by VARCHAR(100)
);
