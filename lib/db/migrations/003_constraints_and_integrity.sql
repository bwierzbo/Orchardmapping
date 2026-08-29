-- Migration 003: data integrity constraints
--
-- The runner wraps this file in a transaction; a failure rolls back cleanly.
--
-- Pre-checks to run manually BEFORE applying to a database with data
-- (the constraints below fail loudly if these return rows):
--
--   SELECT orchard_id, row_id, position, count(*) FROM trees
--     GROUP BY 1,2,3 HAVING count(*) > 1;              -- duplicate positions
--   SELECT DISTINCT status FROM trees
--     WHERE status NOT IN ('healthy','stressed','dead','unknown');
--   SELECT id FROM trees WHERE orchard_id IS NULL;      -- orphan trees

-- Trees: a physical spot in an orchard holds exactly one tree.
ALTER TABLE trees ALTER COLUMN orchard_id SET NOT NULL;
ALTER TABLE trees ADD CONSTRAINT trees_orchard_row_pos_uniq
  UNIQUE (orchard_id, row_id, position);
-- (the unique constraint's backing index also serves the row/position
--  lookups in checkDuplicateRowPosition and bulk upserts)

ALTER TABLE trees ADD CONSTRAINT trees_status_check
  CHECK (status IN ('healthy', 'stressed', 'dead', 'unknown'));

-- Orchards: zoom sanity. tile_max_zoom is INTEGER; app code must round
-- before insert (fractional zooms silently rounded by Postgres otherwise).
ALTER TABLE orchards ADD CONSTRAINT orchards_zoom_check
  CHECK (
    tile_min_zoom IS NULL OR tile_max_zoom IS NULL
    OR (tile_min_zoom >= 0 AND tile_max_zoom <= 24 AND tile_min_zoom <= tile_max_zoom)
  );
