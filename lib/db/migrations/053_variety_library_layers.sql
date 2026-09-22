-- The variety library gets a fruit type and two layers.
--
-- Two problems, one migration.
--
-- First, every row was implicitly an apple: there was no fruit_type, so a
-- medlar, a quince or a plum could not be described at all — while the
-- orchards already hold medlar, persimmon, hazelnut, huckleberry and
-- several berries.
--
-- Second, the library was a single global list. That is right for real
-- cultivars, which every grower should be offered, and wrong for the
-- names one grower uses for their own trees. "Old Bremerton" is a real
-- distinction on one property and noise on anybody else's; a grower's
-- private seedling name should not become a permanent option for
-- everyone the moment they type it.
--
-- So: site_id NULL means the curated layer everyone sees, and site_id
-- set means private to that site. A name resolves private-first, then
-- global, so a site can also hold its own view of a name the curated
-- layer already has.

ALTER TABLE variety_attributes
  ADD COLUMN IF NOT EXISTS fruit_type TEXT NOT NULL DEFAULT 'apple';

ALTER TABLE variety_attributes
  ADD COLUMN IF NOT EXISTS site_id TEXT REFERENCES sites(id) ON DELETE CASCADE;

COMMENT ON COLUMN variety_attributes.site_id IS
  'NULL = the curated layer, offered to every orchard. Set = private to that site.';
COMMENT ON COLUMN variety_attributes.fruit_type IS
  'apple, pear, quince, medlar, plum, … Existing rows were all apples.';

-- The primary key was the name itself, which cannot hold two layers.
-- Joins elsewhere are on the name, not the key, so a surrogate is free.
ALTER TABLE variety_attributes DROP CONSTRAINT IF EXISTS variety_attributes_pkey;
ALTER TABLE variety_attributes ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY;

-- One row per name per layer, case-insensitively: "Kingston Black" and
-- "kingston black" are the same apple, and that is exactly the mistake
-- the picker exists to prevent.
DROP INDEX IF EXISTS variety_attributes_name_layer_uniq;
CREATE UNIQUE INDEX variety_attributes_name_layer_uniq
  ON variety_attributes (lower(variety), COALESCE(site_id, ''));

CREATE INDEX IF NOT EXISTS variety_attributes_site_idx ON variety_attributes (site_id);
