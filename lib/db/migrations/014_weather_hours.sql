-- Hourly temperature history per orchard, fetched from Open-Meteo.
-- ts is orchard-local clock time (America/Los_Angeles) stored without
-- zone: chill and degree-day models bucket by local calendar day, so
-- local-naive is the correct representation. DST repeats resolve via
-- the primary key (first write wins).
CREATE TABLE IF NOT EXISTS weather_hours (
  orchard_id TEXT NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  ts TIMESTAMP NOT NULL,
  temp_c REAL NOT NULL,
  PRIMARY KEY (orchard_id, ts)
);
