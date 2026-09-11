-- Named area features drawn on the orchard map: raised garden beds,
-- berry fields, and any future block/building outline. Polygon is a
-- GeoJSON Polygon geometry (same convention as orchards.boundary_geojson).
CREATE TABLE IF NOT EXISTS orchard_areas (
  id SERIAL PRIMARY KEY,
  orchard_id TEXT NOT NULL REFERENCES orchards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'area',
  color TEXT,
  notes TEXT,
  polygon JSONB NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orchard_areas_orchard_idx ON orchard_areas (orchard_id);
