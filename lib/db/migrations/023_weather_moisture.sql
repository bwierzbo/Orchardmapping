-- Precipitation and humidity alongside the hourly temperatures.
--
-- Temperature alone can time the codling moth model, but every disease
-- in a maritime program is driven by WETNESS: scab infection periods
-- (Mills) need hours of leaf wetness at a given mean temperature, and
-- anthracnose excision has to be scheduled into dry weather. Open-Meteo
-- returns both fields in the same request that already fetches
-- temperature, so this costs one API parameter and two columns.
--
-- Nullable on purpose: every row backfilled before this migration has
-- temperature only. insertHours upserts these columns over NULLs, so
-- re-running scripts/backfill-weather.ts --refetch fills the history in
-- place without disturbing the stored temperatures.

ALTER TABLE weather_hours
  ADD COLUMN IF NOT EXISTS precip_mm REAL;
--> statement-breakpoint

ALTER TABLE weather_hours
  ADD COLUMN IF NOT EXISTS rh_pct REAL;
