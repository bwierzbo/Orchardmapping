-- Migration 004: orchard boundary polygon ("cutout")
--
-- An orchard's planted footprint, traced from aerial imagery, stored as a
-- GeoJSON Polygon geometry ({ "type": "Polygon", "coordinates": [...] }).
--
-- This lets an orchard exist and be usable before it has been flown: the
-- viewer draws the boundary so trees can be placed against a real outline
-- instead of a blank background. Nullable — orchards backed by an
-- orthomosaic don't need one, and adding one later is just an UPDATE.

ALTER TABLE orchards ADD COLUMN IF NOT EXISTS boundary_geojson JSONB;
