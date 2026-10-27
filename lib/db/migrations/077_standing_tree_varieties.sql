-- Migration: every variety standing in the ground, grafts included.
--
-- 076 put a second variety on a tree, but everything that counts varieties
-- -- the variety library, the picker, the harvest calendar -- read only
-- trees.variety, so a Chehalis limb on a Gala tree counted nowhere. This
-- view is the one answer to "where is this variety growing": a row per
-- standing tree per variety it carries, its own and each growing graft.
--
-- A graft of the tree's own variety is the same variety on the same tree
-- and is counted once, as the tree's. Removed trees and grafts that did not
-- take or were cut out are not growing anything.

CREATE OR REPLACE VIEW standing_tree_varieties AS
SELECT DISTINCT ON (v.tree_id, lower(btrim(v.variety)))
       v.tree_id, v.orchard_id, btrim(v.variety) AS variety, v.fruit_type, v.is_graft
FROM (
  SELECT t.tree_id, t.orchard_id, t.variety, t.fruit_type, false AS is_graft
  FROM trees t
  WHERE t.removed_on IS NULL AND btrim(COALESCE(t.variety, '')) <> ''
  UNION ALL
  SELECT t.tree_id, t.orchard_id, g.variety, t.fruit_type, true AS is_graft
  FROM tree_grafts g
  JOIN trees t ON t.tree_id = g.tree_id
  WHERE t.removed_on IS NULL AND g.status = 'growing' AND btrim(g.variety) <> ''
) v
ORDER BY v.tree_id, lower(btrim(v.variety)), v.is_graft;

COMMENT ON VIEW standing_tree_varieties IS
  'One row per standing tree per variety it carries: its own (is_graft false) and each growing graft (true). The source for counting where a variety grows.';
