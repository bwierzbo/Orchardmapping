-- Monitoring traps and their counts.
--
-- Apple maggot is by far the most serious west-side insect (WSU EB0937)
-- and it is entirely trap-driven: kaolin starts on the first catch, not
-- on a date. Without this table the program's threshold steps sit in
-- "monitor" forever, because nothing can tell them the spheres caught
-- anything.
--
-- No coordinates yet. A trap's position matters, but putting it on the
-- map means a MapLibre layer, and a nullable lat/lng that nothing writes
-- would be worse than honest text. location_note carries "north end,
-- row 4" until the layer exists.

CREATE TABLE IF NOT EXISTS traps (
  id SERIAL PRIMARY KEY,
  orchard_id TEXT NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  -- one of lib/traps.ts TRAP_TYPES
  trap_type TEXT NOT NULL,
  label TEXT NOT NULL,
  location_note TEXT,
  deployed_on DATE NOT NULL,
  removed_on DATE,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS traps_orchard_idx ON traps (orchard_id, trap_type);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS trap_counts (
  id SERIAL PRIMARY KEY,
  trap_id INTEGER NOT NULL REFERENCES traps(id) ON DELETE CASCADE,
  counted_on DATE NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
--> statement-breakpoint

-- One count per trap per day: checking a trap twice is a correction,
-- not two catches.
CREATE UNIQUE INDEX IF NOT EXISTS trap_counts_once_a_day_idx
  ON trap_counts (trap_id, counted_on);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS trap_counts_date_idx ON trap_counts (counted_on DESC);
--> statement-breakpoint

-- Kaolin is a film that has to be maintained, not a single application.
UPDATE program_steps SET repeat_days = 10 WHERE key = 'maggot_kaolin';
