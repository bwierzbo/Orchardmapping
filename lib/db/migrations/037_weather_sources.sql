-- Weather gets a provenance, and more than one source per hour.
--
-- Everything stored so far came from Open-Meteo on a 9-25 km grid, and
-- checking it against this orchard's own geography showed what that
-- costs. Five points across 26 miles of the sharpest rain shadow in the
-- state collapse into TWO grid cells: the orchard and Sequim, nine
-- miles apart across the steepest part of the gradient, are given
-- identical rainfall. The grid resolves an 18% spread where the real
-- gradient is around 56%, and reads roughly two to three times too wet
-- throughout.
--
-- Temperature survives that far better than rainfall — it varies
-- smoothly and the grid handles it well — which is why the degree-day
-- work stands. Anything wetness-driven does not.
--
-- So an hour is no longer one row from one place. The primary key gains
-- the source, several sources coexist for the same hour, and reads
-- resolve per VARIABLE by priority: a station that measures rain but
-- not leaf wetness contributes its rain without blanking anything else.
-- Keeping every source rather than overwriting also means two sources
-- disagreeing is visible, which is information; a single silent source
-- is a leap of faith.

ALTER TABLE weather_hours
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'openmeteo';
--> statement-breakpoint

ALTER TABLE weather_hours DROP CONSTRAINT IF EXISTS weather_hours_pkey;
--> statement-breakpoint
ALTER TABLE weather_hours ADD PRIMARY KEY (orchard_id, ts, source);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS weather_hours_lookup_idx
  ON weather_hours (orchard_id, ts);
--> statement-breakpoint

-- Which sources serve an orchard, and in what order.
--
-- Lower priority number wins. The intended chain, best first:
--   10  onsite      a station at the orchard — nothing to interpolate
--   20  station     nearest AgWeatherNet station (Sequim, 3.5 mi)
--   30  interpolated  between two stations that bracket the site
--   90  openmeteo   gridded: the archive, and the only 16-day forecast
--
-- Open-Meteo stays last rather than being removed. It is the only
-- source that reaches back to 2021, and the only one that forecasts,
-- which is what a preemptive spray decision needs.
CREATE TABLE IF NOT EXISTS weather_sources (
  orchard_id TEXT NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  -- onsite | station | interpolated | gridded
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  priority INTEGER NOT NULL,
  /* Provider's own station id, where there is one. */
  station_id TEXT,
  lat NUMERIC(10, 7),
  lng NUMERIC(10, 7),
  distance_miles NUMERIC(6, 2),
  /* True only when leaf wetness is MEASURED. Neither AgWeatherNet
     station near this orchard carries the sensor; Open-Meteo's is a
     modelled dew probability that lib/scab.ts declines to trust. */
  measures_leaf_wetness BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (orchard_id, source)
);
--> statement-breakpoint

-- Every orchard already has gridded weather; record it as such.
INSERT INTO weather_sources (orchard_id, source, kind, label, priority, notes)
SELECT id, 'openmeteo', 'gridded', 'Open-Meteo (gridded)', 90,
       'ERA5 archive back to 2021 plus a 16-day forecast. Resolves temperature well; under-resolves the rain shadow badly and reads about 2x too wet here.'
FROM orchards
ON CONFLICT (orchard_id, source) DO NOTHING;
