-- An orchard keeps its own clock.
--
-- Until now every weather hour, every "today" and every spray's calendar
-- day was computed in America/Los_Angeles, hardcoded as a module constant
-- in lib/openmeteo.ts. That is invisible while every orchard is on the
-- Olympic Peninsula and silently wrong the moment one is not: hours land
-- three off in Michigan and eight in the UK, which moves chill hours and
-- scab wet-period boundaries across day lines rather than merely
-- relabelling them.
--
-- weather_hours.ts has always meant "orchard-local clock time" (migration
-- 014). That stays true — it just stops meaning Pacific for everyone. The
-- existing rows need no backfill because every orchard that exists today
-- really is Pacific.
--
-- No DEFAULT on purpose. A default would quietly re-create the very
-- assumption this removes; creation resolves the zone from the orchard's
-- coordinates instead.

ALTER TABLE orchards ADD COLUMN IF NOT EXISTS timezone TEXT;

UPDATE orchards SET timezone = 'America/Los_Angeles' WHERE timezone IS NULL;

ALTER TABLE orchards ALTER COLUMN timezone SET NOT NULL;

COMMENT ON COLUMN orchards.timezone IS
  'IANA zone for this orchard''s local clock (America/Los_Angeles, America/Detroit, Europe/London). Resolved from its coordinates when created. weather_hours.ts is stored in this zone.';
