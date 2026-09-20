-- The steps of the orchard's IPM program, each with the trigger that
-- places it on a season.
--
-- A step is almost never "do this on April 12": it is anchored to a
-- growth stage, an accumulated degree-day total, a part of the year, or
-- a condition you can only watch for. trigger_spec holds that shape —
-- see the Trigger union in lib/ipm-schedule.ts, which is the authority
-- on what is valid. JSONB rather than a column per trigger kind: the
-- shapes have almost nothing in common, and a table of mostly-NULL
-- columns would say less.
--
-- Steps are global, like pest_library — this is regional agronomy, not
-- per-orchard configuration. is_active is how a step that doesn't apply
-- gets switched off.
--
-- "trigger" is a Postgres keyword, hence trigger_spec.

CREATE TABLE IF NOT EXISTS program_steps (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  -- disease | insect | sanitation | monitoring
  category TEXT NOT NULL,
  pest_key TEXT REFERENCES pest_library(key) ON DELETE SET NULL,
  material_key TEXT REFERENCES spray_materials(material_key) ON DELETE SET NULL,
  trigger_spec JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS program_steps_active_idx
  ON program_steps (is_active, sort_order);
