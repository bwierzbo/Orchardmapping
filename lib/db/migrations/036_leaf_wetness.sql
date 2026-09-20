-- Leaf wetness, the input the scab model actually wants.
--
-- Mills is defined on hours of LEAF WETNESS, not on rainfall. Rain is
-- only the start of a wet period; dew and shade hold leaves wet long
-- after the gauge stops reading, and that tail is often what completes
-- an infection. Inferring it from rain and humidity alone under-reads
-- the end of every event.
--
-- Open-Meteo publishes an hourly leaf-wetness probability for both the
-- archive and a 16-day forecast, verified against this orchard's
-- coordinates. It is a modelled estimate, not a sensor — a real leaf
-- wetness sensor remains the single biggest improvement available to
-- the scab model — but it is a better signal than humidity alone and it
-- costs nothing.
--
-- Nullable, like the moisture columns before it: rows written before
-- this migration carry temperature, rain and humidity only, and
-- insertHours fills it over NULL so a --refetch repairs history.

ALTER TABLE weather_hours
  ADD COLUMN IF NOT EXISTS leaf_wetness_pct REAL;
